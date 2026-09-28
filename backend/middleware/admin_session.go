package middleware

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const adminCookieName = "__Host-audio_admin"

type AdminAuth struct {
	apiKey     string
	signingKey []byte
	ttl        time.Duration
	origins    map[string]bool
	now        func() time.Time
	failures   *AdminFailureLimiter
}

type adminClaims struct {
	IssuedAt  int64 `json:"iat"`
	ExpiresAt int64 `json:"exp"`
}

func NewAdminAuth(apiKey, secret string, ttl time.Duration, origins []string, failures *AdminFailureLimiter) *AdminAuth {
	// A separate signing purpose and the current credential bind cookies to this
	// admin key, without putting the credential in the cookie itself.
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte("audio-share/admin-session/v1\x00" + apiKey))
	allowed := make(map[string]bool, len(origins))
	for _, origin := range origins {
		allowed[origin] = true
	}
	return &AdminAuth{apiKey: apiKey, signingKey: mac.Sum(nil), ttl: ttl, origins: allowed, now: time.Now, failures: failures}
}

func (a *AdminAuth) signature(payload string) []byte {
	mac := hmac.New(sha256.New, a.signingKey)
	mac.Write([]byte(payload))
	return mac.Sum(nil)
}

func (a *AdminAuth) validKey(r *http.Request) bool {
	return a.apiKey != "" && hmac.Equal([]byte(r.Header.Get("X-API-Key")), []byte(a.apiKey))
}

func (a *AdminAuth) claims(r *http.Request) (adminClaims, bool) {
	var claims adminClaims
	cookie, err := r.Cookie(adminCookieName)
	if err != nil || a.apiKey == "" || len(cookie.Value) > 1024 {
		return claims, false
	}
	payload, signature, ok := strings.Cut(cookie.Value, ".")
	if !ok {
		return claims, false
	}
	sig, err := base64.RawURLEncoding.DecodeString(signature)
	if err != nil || !hmac.Equal(sig, a.signature(payload)) {
		return claims, false
	}
	body, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil || json.Unmarshal(body, &claims) != nil {
		return claims, false
	}
	now := a.now().Unix()
	return claims, claims.IssuedAt <= now && claims.ExpiresAt > now && claims.ExpiresAt > claims.IssuedAt && claims.ExpiresAt-claims.IssuedAt <= int64(a.ttl/time.Second)
}

func (a *AdminAuth) sameOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" || origin == "null" {
		return false
	}
	scheme := "http"
	if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	return origin == scheme+"://"+r.Host || a.origins[origin]
}

// Browsers may omit Origin on GETs, so also reject cross-origin fetch metadata.
// Requests without browser headers remain usable by API-key scripts.
func (a *AdminAuth) trustedBrowserOrigin(r *http.Request) bool {
	if r.Header.Get("Origin") != "" {
		return a.sameOrigin(r)
	}
	site := r.Header.Get("Sec-Fetch-Site")
	return site == "" || site == "same-origin" || site == "none"
}

func adminJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(value)
}

func adminCookie(value string, expires time.Time, maxAge int) *http.Cookie {
	return &http.Cookie{Name: adminCookieName, Value: value, Path: "/", HttpOnly: true, Secure: true, SameSite: http.SameSiteStrictMode, Expires: expires, MaxAge: maxAge}
}

func (a *AdminAuth) authenticateKey(w http.ResponseWriter, r *http.Request) bool {
	if r.Header.Get("X-API-Key") == "" {
		if _, err := r.Cookie(adminCookieName); err != nil {
			a.rejectAuthentication(w, 0)
			return false
		}
	}
	valid, retry := a.failures.Check(r, a.now(), func() bool { return a.validKey(r) })
	if !valid {
		a.rejectAuthentication(w, retry)
	}
	return valid
}

func (a *AdminAuth) rejectAuthentication(w http.ResponseWriter, retry int) {
	if retry > 0 {
		w.Header().Set("Retry-After", strconv.Itoa(retry))
		adminJSON(w, http.StatusTooManyRequests, map[string]string{"code": "admin_auth_rate_limited", "error": "Too many failed admin authentication attempts. Try again in " + strconv.Itoa(retry) + " seconds."})
		return
	}
	adminJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
}

// SessionHandler exchanges an API key for a fixed-lifetime signed cookie.
// DELETE clears the browser cookie; stateless tokens are not individually revocable.
func (a *AdminAuth) SessionHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if !a.trustedBrowserOrigin(r) {
		adminJSON(w, http.StatusForbidden, map[string]string{"error": "Untrusted origin"})
		return
	}
	switch r.Method {
	case http.MethodPost:
		if !a.sameOrigin(r) {
			adminJSON(w, http.StatusForbidden, map[string]string{"error": "Untrusted origin"})
			return
		}
		if !a.authenticateKey(w, r) {
			return
		}
		now := a.now().UTC().Truncate(time.Second)
		expires := now.Add(a.ttl).Truncate(time.Second)
		body, _ := json.Marshal(adminClaims{IssuedAt: now.Unix(), ExpiresAt: expires.Unix()})
		payload := base64.RawURLEncoding.EncodeToString(body)
		token := payload + "." + base64.RawURLEncoding.EncodeToString(a.signature(payload))
		http.SetCookie(w, adminCookie(token, expires, int(expires.Sub(now)/time.Second)))
		adminJSON(w, http.StatusOK, map[string]time.Time{"expiresAt": expires})
	case http.MethodGet:
		claims, valid := a.claims(r)
		if !valid {
			// A normal signed-out session probe does not consume the login allowance.
			retry := 0
			if _, err := r.Cookie(adminCookieName); err == nil {
				_, retry = a.failures.Check(r, a.now(), func() bool { return false })
			}
			a.rejectAuthentication(w, retry)
			return
		}
		adminJSON(w, http.StatusOK, map[string]time.Time{"expiresAt": time.Unix(claims.ExpiresAt, 0).UTC()})
	case http.MethodDelete:
		if !a.sameOrigin(r) {
			adminJSON(w, http.StatusForbidden, map[string]string{"error": "Untrusted origin"})
			return
		}
		http.SetCookie(w, adminCookie("", time.Unix(1, 0), -1))
		w.WriteHeader(http.StatusNoContent)
	default:
		w.Header().Set("Allow", "GET, POST, DELETE")
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (a *AdminAuth) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if !a.trustedBrowserOrigin(r) {
			adminJSON(w, http.StatusForbidden, map[string]string{"error": "Untrusted origin"})
			return
		}
		if _, valid := a.claims(r); !valid {
			if !a.authenticateKey(w, r) {
				return
			}
			next.ServeHTTP(w, r)
			return
		}
		// A valid cookie keeps an established admin session usable during a
		// key-login cooldown; scripts may still explicitly authenticate by key.
		if a.validKey(r) {
			next.ServeHTTP(w, r)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead && r.Method != http.MethodOptions && !a.sameOrigin(r) {
			adminJSON(w, http.StatusForbidden, map[string]string{"error": "Untrusted origin"})
			return
		}
		next.ServeHTTP(w, r)
	})
}
