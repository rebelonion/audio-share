package middleware

import (
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func adminRequest(method, path string, cookie *http.Cookie) *http.Request {
	r := httptest.NewRequest(method, "https://archive.test"+path, nil)
	if cookie != nil {
		r.AddCookie(cookie)
	}
	return r
}

func loginCookie(t *testing.T, auth *AdminAuth) *http.Cookie {
	t.Helper()
	r := adminRequest(http.MethodPost, "/api/admin/session", nil)
	r.Header.Set("X-API-Key", auth.apiKey)
	r.Header.Set("Origin", "https://archive.test")
	w := httptest.NewRecorder()
	auth.SessionHandler(w, r)
	if w.Code != 200 || len(w.Result().Cookies()) != 1 {
		t.Fatalf("login status=%d cookies=%v", w.Code, w.Result().Cookies())
	}
	return w.Result().Cookies()[0]
}

func TestAdminCookieLifetimeAndRotation(t *testing.T) {
	now := time.Date(2026, 9, 28, 12, 0, 0, 0, time.UTC)
	auth := NewAdminAuth("private-key", "session-secret", 2*time.Hour, nil)
	auth.now = func() time.Time { return now }
	cookie := loginCookie(t, auth)
	if !cookie.Secure || !cookie.HttpOnly || cookie.SameSite != http.SameSiteStrictMode || cookie.Path != "/" || cookie.Domain != "" || cookie.MaxAge != 7200 || !cookie.Expires.Equal(now.Add(2*time.Hour)) {
		t.Fatalf("cookie attributes=%+v", cookie)
	}
	payload, _, _ := strings.Cut(cookie.Value, ".")
	decoded, _ := base64.RawURLEncoding.DecodeString(payload)
	if strings.Contains(string(decoded), "private-key") {
		t.Fatal("credential exposed in cookie")
	}
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) })
	for _, offset := range []time.Duration{0, time.Hour, 2*time.Hour - time.Second, 2 * time.Hour} {
		auth.now = func() time.Time { return now.Add(offset) }
		w := httptest.NewRecorder()
		auth.Middleware(next).ServeHTTP(w, adminRequest("GET", "/api/admin/health", cookie))
		want := 204
		if offset == 2*time.Hour {
			want = 401
		}
		if w.Code != want || w.Header().Get("Cache-Control") != "no-store" || len(w.Result().Cookies()) != 0 {
			t.Fatalf("offset=%v status=%d", offset, w.Code)
		}
	}
	for _, changed := range []*AdminAuth{
		NewAdminAuth("rotated-key", "session-secret", 2*time.Hour, nil),
		NewAdminAuth("private-key", "rotated-secret", 2*time.Hour, nil),
		NewAdminAuth("", "session-secret", 2*time.Hour, nil),
		NewAdminAuth("private-key", "session-secret", time.Hour, nil),
	} {
		changed.now = func() time.Time { return now }
		if _, valid := changed.claims(adminRequest("GET", "/api/admin/health", cookie)); valid {
			t.Fatal("old cookie accepted after credential/TTL change")
		}
	}
	auth.now = func() time.Time { return now }
	for _, value := range []string{"", cookie.Value + "x", payload + ".bad", "eyJleHAiOjk5OTk5OTk5OTl9.invalid", "unrelated-profile-cookie"} {
		if _, valid := auth.claims(adminRequest("GET", "/api/admin/health", &http.Cookie{Name: adminCookieName, Value: value})); valid {
			t.Fatal("invalid cookie accepted")
		}
	}
}

func TestAdminCookieOriginProtectionAndAPIKeyCompatibility(t *testing.T) {
	auth := NewAdminAuth("key", "secret", 8*time.Hour, []string{"http://localhost:5173"})
	cookie := loginCookie(t, auth)
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) })
	for _, origin := range []string{"", "null", "https://evil.test", "https://sub.archive.test", "https://archive.test", "http://localhost:5173"} {
		for _, method := range []string{"POST", "PATCH", "DELETE"} {
			r := adminRequest(method, "/api/admin/requests", cookie)
			r.Header.Set("Origin", origin)
			w := httptest.NewRecorder()
			auth.Middleware(next).ServeHTTP(w, r)
			want := 403
			if origin == "https://archive.test" || origin == "http://localhost:5173" {
				want = 204
			}
			if w.Code != want {
				t.Fatalf("origin=%q method=%s status=%d", origin, method, w.Code)
			}
		}
	}
	// Header-authenticated scripts do not depend on a browser Origin or cookie.
	r := adminRequest("PATCH", "/api/admin/requests", nil)
	r.Header.Set("X-API-Key", "key")
	w := httptest.NewRecorder()
	auth.Middleware(next).ServeHTTP(w, r)
	if w.Code != 204 {
		t.Fatalf("API key status=%d", w.Code)
	}
	// A proxy may terminate TLS, but its public origin must still match.
	r = httptest.NewRequest("DELETE", "http://archive.test/api/admin/session", nil)
	r.Header.Set("X-Forwarded-Proto", "https")
	r.Header.Set("Origin", "https://archive.test")
	w = httptest.NewRecorder()
	auth.SessionHandler(w, r)
	if w.Code != 204 {
		t.Fatalf("proxied logout status=%d", w.Code)
	}
}

func TestAdminSessionEndpoints(t *testing.T) {
	auth := NewAdminAuth("key", "secret", 8*time.Hour, nil)
	cookie := loginCookie(t, auth)
	for _, tc := range []struct {
		method, key, origin string
		cookie              *http.Cookie
		want                int
	}{
		{"POST", "wrong", "https://archive.test", nil, 401},
		{"POST", "key", "https://evil.test", nil, 403},
		{"POST", "key", "", nil, 403},
		{"GET", "", "", nil, 401},
		{"GET", "", "", cookie, 200},
		{"DELETE", "", "https://evil.test", cookie, 403},
		{"DELETE", "", "https://archive.test", cookie, 204},
		{"DELETE", "", "https://archive.test", nil, 204},
		{"PUT", "key", "https://archive.test", nil, 405},
	} {
		r := adminRequest(tc.method, "/api/admin/session", tc.cookie)
		r.Header.Set("X-API-Key", tc.key)
		r.Header.Set("Origin", tc.origin)
		w := httptest.NewRecorder()
		auth.SessionHandler(w, r)
		if w.Code != tc.want || w.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("method=%s key=%s origin=%s status=%d", tc.method, tc.key, tc.origin, w.Code)
		}
		if tc.method == "DELETE" && tc.want == 204 {
			cookies := w.Result().Cookies()
			if len(cookies) != 1 || cookies[0].Name != adminCookieName || cookies[0].MaxAge != -1 || !cookies[0].Secure || !cookies[0].HttpOnly {
				t.Fatalf("logout cookie=%v", cookies)
			}
		}
	}
}
