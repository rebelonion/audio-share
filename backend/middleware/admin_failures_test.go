package middleware

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/onion/audio-share-backend/clientip"
)

func TestAdminFailuresSharedAcrossRoutesAndCredentials(t *testing.T) {
	auth := newTestAdminAuth("key", "secret", 8*time.Hour, nil)
	auth.failures.limit = 3
	now := time.Date(2026, 9, 28, 12, 0, 0, 0, time.UTC)
	auth.now = func() time.Time { return now }
	cookie := loginCookie(t, auth)
	mux := http.NewServeMux()
	mux.HandleFunc("/api/admin/session", auth.SessionHandler)
	mux.Handle("/api/admin/", auth.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) })))
	attempt := func(method, path, key string, cookie *http.Cookie) *httptest.ResponseRecorder {
		r := adminRequest(method, path, cookie)
		r.Header.Set("Origin", "https://archive.test")
		r.Header.Set("X-API-Key", key)
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		return w
	}
	// Loading the sign-in page normally must not consume the allowance.
	for range 20 {
		if got := attempt("GET", "/api/admin/session", "", nil).Code; got != 401 {
			t.Fatalf("session probe=%d", got)
		}
	}
	for _, path := range []string{"/api/admin/session", "/api/admin/health", "/api/admin/requests"} {
		method := "GET"
		if path == "/api/admin/session" {
			method = "POST"
		}
		if got := attempt(method, path, "wrong", nil).Code; got != 401 {
			t.Fatalf("failure status=%d", got)
		}
	}
	for _, key := range []string{"wrong", "key"} {
		for _, path := range []string{"/api/admin/session", "/api/admin/health", "/api/admin/requests/42"} {
			w := attempt("POST", path, key, nil)
			if w.Code != 429 || w.Header().Get("Retry-After") != "900" || w.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("blocked response: %d %v", w.Code, w.Header())
			}
		}
	}
	// Established cookie sessions work during cooldown, including writes.
	if got := attempt("GET", "/api/admin/session", "", cookie).Code; got != 200 {
		t.Fatalf("cookie session=%d", got)
	}
	if got := attempt("PATCH", "/api/admin/requests/42", "", cookie).Code; got != 204 {
		t.Fatalf("cookie write=%d", got)
	}
	if got := attempt("DELETE", "/api/admin/session", "", nil).Code; got != 204 {
		t.Fatalf("logout=%d", got)
	}
	now = now.Add(30*time.Second + time.Millisecond)
	if got := attempt("POST", "/api/admin/session", "key", nil).Header().Get("Retry-After"); got != "870" {
		t.Fatalf("retry=%s", got)
	}
	now = now.Add(15 * time.Minute)
	if got := attempt("POST", "/api/admin/session", "key", nil).Code; got != 200 {
		t.Fatalf("login after cooldown=%d", got)
	}
}

func TestAdminFailureLimiterDoesNotVerifyBlockedGuesses(t *testing.T) {
	limiter, _ := NewAdminFailureLimiter(5, "1m")
	r := adminRequest("POST", "/api/admin/session", nil)
	now := time.Now()
	var checks, rejected atomic.Int32
	var wg sync.WaitGroup
	for range 40 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, retry := limiter.Check(r, now, func() bool { checks.Add(1); return false })
			if retry > 0 {
				rejected.Add(1)
			}
		}()
	}
	wg.Wait()
	if checks.Load() != 5 || rejected.Load() != 35 {
		t.Fatalf("checks=%d throttled=%d", checks.Load(), rejected.Load())
	}
	// A correct guess must not bypass the cooldown either.
	valid, retry := limiter.Check(r, now, func() bool { t.Error("blocked credential was checked"); return true })
	if valid || retry != 60 {
		t.Fatalf("valid=%v retry=%d", valid, retry)
	}
}

func TestAdminFailureSuccessesDoNotConsumeOrResetAllowance(t *testing.T) {
	limiter, _ := NewAdminFailureLimiter(2, "1s")
	now := time.Now()
	r := adminRequest("GET", "/api/admin/health", nil)
	for range 20 {
		if valid, _ := limiter.Check(r, now, func() bool { return true }); !valid {
			t.Fatal("valid key blocked")
		}
	}
	limiter.Check(r, now, func() bool { return false })
	limiter.Check(r, now, func() bool { return true })
	limiter.Check(r, now, func() bool { return false })
	if _, retry := limiter.Check(r, now, func() bool { return true }); retry != 1 {
		t.Fatal("success reset failure allowance")
	}
	if valid, _ := limiter.Check(r, now.Add(time.Second), func() bool { return true }); !valid {
		t.Fatal("exact window boundary blocked")
	}
}

func TestAdminFailuresUseForwardedClientIP(t *testing.T) {
	for _, header := range []string{"CF-Connecting-IP", "X-Real-IP", "X-Forwarded-For"} {
		t.Run(header, func(t *testing.T) {
			resolver, err := clientip.New("private", header)
			if err != nil {
				t.Fatal(err)
			}
			limiter, _ := NewAdminFailureLimiter(1, "1m")
			now := time.Now()
			r := adminRequest("POST", "/api/admin/session", nil)
			r.RemoteAddr = "10.0.0.1:1234"
			r.Header.Set(header, "192.0.2.5")
			limiter.Check(resolver.Attach(r), now, func() bool { return false })
			r.RemoteAddr = "10.0.0.2:5678"
			if _, retry := limiter.Check(resolver.Attach(r), now, func() bool { t.Error("same client escaped cooldown through a different proxy"); return true }); retry != 60 {
				t.Fatalf("retry=%d", retry)
			}
			r.Header.Set(header, "192.0.2.6")
			if valid, _ := limiter.Check(resolver.Attach(r), now, func() bool { return true }); !valid {
				t.Fatal("different client behind same proxy blocked")
			}
		})
	}
}

func TestAdminFailuresIgnoreHeadersFromUntrustedPeers(t *testing.T) {
	resolver, err := clientip.New("private", "")
	if err != nil {
		t.Fatal(err)
	}
	limiter, _ := NewAdminFailureLimiter(1, "1m")
	now := time.Now()
	r := adminRequest("POST", "/api/admin/session", nil)
	r.RemoteAddr = "203.0.113.8:1234"
	r.Header.Set("X-Forwarded-For", "192.0.2.5")
	limiter.Check(resolver.Attach(r), now, func() bool { return false })
	for _, spoofed := range []string{"192.0.2.6", "127.0.0.1"} {
		r.Header.Set("X-Forwarded-For", spoofed)
		r.Header.Set("CF-Connecting-IP", spoofed)
		if _, retry := limiter.Check(resolver.Attach(r), now, func() bool { t.Error("spoofed header escaped cooldown"); return true }); retry != 60 {
			t.Fatalf("retry=%d", retry)
		}
	}
}

func TestAdminFailureCapacityKeepsClientsIsolated(t *testing.T) {
	limiter, _ := NewAdminFailureLimiter(1, "1m")
	now := time.Now()
	r := adminRequest("POST", "/api/admin/session", nil)
	for i := range maxAdminFailureClients {
		r.RemoteAddr = fmt.Sprintf("[2001:db8::%x]:1234", i)
		limiter.Check(r, now, func() bool { return false })
	}
	// Keep the first client active; the next oldest should be evicted instead.
	r.RemoteAddr = "[2001:db8::0]:1234"
	limiter.Check(r, now, func() bool { t.Error("blocked key checked"); return true })
	for i := range 3 {
		r.RemoteAddr = fmt.Sprintf("192.0.2.%d:1234", i)
		if valid, retry := limiter.Check(r, now, func() bool { return false }); valid || retry != 0 {
			t.Fatal("unrelated client inherited another client's lockout")
		}
		if _, retry := limiter.Check(r, now, func() bool { t.Error("blocked key checked"); return true }); retry != 60 {
			t.Fatalf("new client not individually throttled: retry=%d", retry)
		}
	}
	r.RemoteAddr = "203.0.113.1:1234"
	if valid, retry := limiter.Check(r, now, func() bool { return true }); !valid || retry != 0 {
		t.Fatal("correct key from untracked client blocked at capacity")
	}
	if len(limiter.clients) != maxAdminFailureClients || limiter.recent.Len() != maxAdminFailureClients {
		t.Fatal("failure tracking exceeded capacity")
	}
	r.RemoteAddr = "[2001:db8::0]:5678"
	if _, retry := limiter.Check(r, now, func() bool { t.Error("recent lockout evicted"); return true }); retry != 60 {
		t.Fatal("recent lockout lost")
	}
	r.RemoteAddr = "[2001:db8::1]:5678"
	if valid, _ := limiter.Check(r, now, func() bool { return true }); !valid {
		t.Fatal("least recently used client was not evicted")
	}
	if valid, _ := limiter.Check(r, now.Add(time.Minute), func() bool { return true }); !valid || len(limiter.clients) != 0 || limiter.recent.Len() != 0 {
		t.Fatal("expired tracking not removed")
	}
}

func TestAdminFailureLimiterConfiguration(t *testing.T) {
	for _, tc := range []struct {
		limit  int
		window string
	}{
		{0, "1m"}, {-1, "1m"}, {1, "0s"}, {1, "500ms"}, {1, "1.5s"}, {1, "invalid"},
	} {
		if _, err := NewAdminFailureLimiter(tc.limit, tc.window); err == nil {
			t.Fatalf("accepted invalid config: %+v", tc)
		}
	}
}

func TestMalformedAdminCookieSharesLoginAllowance(t *testing.T) {
	auth := newTestAdminAuth("key", "secret", time.Hour, nil)
	auth.failures.limit = 1
	r := adminRequest("GET", "/api/admin/session", &http.Cookie{Name: adminCookieName, Value: "invalid"})
	w := httptest.NewRecorder()
	auth.SessionHandler(w, r)
	if w.Code != 401 {
		t.Fatalf("bad cookie status=%d", w.Code)
	}
	r = adminRequest("POST", "/api/admin/session", nil)
	r.Header.Set("X-API-Key", "key")
	r.Header.Set("Origin", "https://archive.test")
	w = httptest.NewRecorder()
	auth.SessionHandler(w, r)
	if w.Code != 429 {
		t.Fatalf("key bypassed cookie failure limit: %d", w.Code)
	}
}

func TestAdminFailureExpiredWindowBeforeCleanup(t *testing.T) {
	limiter, _ := NewAdminFailureLimiter(1, "15m")
	now := time.Now()
	r := adminRequest("POST", "/api/admin/session", nil)
	limiter.Check(r, now, func() bool { return false })
	// Run cleanup just before expiry, leaving the expired entry for the next check.
	limiter.Check(r, now.Add(15*time.Minute-time.Second), func() bool { return false })
	if valid, retry := limiter.Check(r, now.Add(15*time.Minute), func() bool { return false }); valid || retry != 0 {
		t.Fatal("expired client did not receive a fresh window")
	}
	if _, retry := limiter.Check(r, now.Add(15*time.Minute), func() bool { return true }); retry != 900 {
		t.Fatalf("new window retry=%d", retry)
	}
	if len(limiter.clients) != 1 || limiter.recent.Len() != 1 {
		t.Fatal("expiry duplicated tracking")
	}
}

func TestAdminUntrustedAndCredentialFreeRequestsCannotExhaustAllowance(t *testing.T) {
	for _, tc := range []struct {
		name, method, path, origin, site, key string
		cookie                                *http.Cookie
		want                                  int
	}{
		{name: "cross-site login", method: "POST", path: "/api/admin/session", origin: "https://evil.test", want: 403},
		{name: "cross-site login with key", method: "POST", path: "/api/admin/session", origin: "https://evil.test", key: "wrong", want: 403},
		{name: "login without origin", method: "POST", path: "/api/admin/session", key: "wrong", want: 403},
		{name: "cross-site GET", method: "GET", path: "/api/admin/health", origin: "https://evil.test", want: 403},
		{name: "opaque origin", method: "GET", path: "/api/admin/health", origin: "null", key: "wrong", want: 403},
		{name: "cross-site image", method: "GET", path: "/api/admin/health", site: "cross-site", want: 403},
		{name: "same-site subdomain", method: "GET", path: "/api/admin/health", site: "same-site", cookie: &http.Cookie{Name: adminCookieName, Value: "invalid"}, want: 403},
		{name: "cross-site cookie probe", method: "GET", path: "/api/admin/session", site: "cross-site", cookie: &http.Cookie{Name: adminCookieName, Value: "invalid"}, want: 403},
		{name: "legacy image without metadata", method: "GET", path: "/api/admin/health", want: 401},
		{name: "credential-free write", method: "POST", path: "/api/admin/requests", origin: "https://archive.test", want: 401},
		{name: "credential-free login", method: "POST", path: "/api/admin/session", origin: "https://archive.test", want: 401},
		{name: "credential-free session probe", method: "GET", path: "/api/admin/session", want: 401},
	} {
		t.Run(tc.name, func(t *testing.T) {
			auth := newTestAdminAuth("key", "secret", time.Hour, nil)
			mux := http.NewServeMux()
			mux.HandleFunc("/api/admin/session", auth.SessionHandler)
			mux.Handle("/api/admin/", auth.Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { t.Error("unauthenticated request reached handler") })))
			for range 20 {
				r := adminRequest(tc.method, tc.path, tc.cookie)
				r.Header.Set("Origin", tc.origin)
				r.Header.Set("Sec-Fetch-Site", tc.site)
				r.Header.Set("X-API-Key", tc.key)
				w := httptest.NewRecorder()
				mux.ServeHTTP(w, r)
				if w.Code != tc.want || w.Header().Get("Retry-After") != "" {
					t.Fatalf("status=%d headers=%v", w.Code, w.Header())
				}
			}
			if len(auth.failures.clients) != 0 {
				t.Fatal("request consumed failure allowance")
			}
			loginCookie(t, auth)
		})
	}
}

func TestAdminAllowedOriginsAndScriptsStillCountGuesses(t *testing.T) {
	for _, origin := range []string{"", "https://archive.test", "http://localhost:5173"} {
		t.Run(origin, func(t *testing.T) {
			auth := newTestAdminAuth("key", "secret", time.Hour, []string{"http://localhost:5173"})
			auth.failures.limit = 1
			handler := auth.Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(204) }))
			request := func(key string) int {
				r := adminRequest("PATCH", "/api/admin/requests/1", nil)
				r.Header.Set("Origin", origin)
				if origin != "" {
					r.Header.Set("Sec-Fetch-Site", "cross-site")
				}
				r.Header.Set("X-API-Key", key)
				w := httptest.NewRecorder()
				handler.ServeHTTP(w, r)
				return w.Code
			}
			if got := request("key"); got != 204 {
				t.Fatalf("valid key status=%d", got)
			}
			if got := request("wrong"); got != 401 {
				t.Fatalf("bad key status=%d", got)
			}
			if got := request(""); got != 401 {
				t.Fatalf("credential-free status=%d", got)
			}
			if got := request("key"); got != 429 {
				t.Fatalf("cooldown status=%d", got)
			}
		})
	}
}
