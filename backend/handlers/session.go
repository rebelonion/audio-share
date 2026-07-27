package handlers

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const sessionCookieName = "audio_session_id"
const sessionCreatedCookieName = "audio_session_created_at"
const sessionCookieMaxAge = 365 * 24 * 60 * 60
const matureCookieName = "audio_show_mature"

func NewSessionBootstrapHandler(sessionSecret string) http.Handler {
	secret := []byte(sessionSecret)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		sessionID, ok := currentSessionID(r, secret)
		if !ok {
			setSessionCookie(w, r, secret, generateSessionID())
		} else if _, ok := sessionCreatedAt(r, secret, sessionID); !ok {
			setSessionCreatedCookie(w, r, secret, sessionID, time.Now())
		}
		w.WriteHeader(http.StatusNoContent)
	})
}

func generateSessionID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "fallback"
	}
	return hex.EncodeToString(b)
}

func signValue(value string, secret []byte) string {
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(value))
	return value + "." + hex.EncodeToString(mac.Sum(nil))
}

func verifySignedValue(signed string, secret []byte) (string, bool) {
	dot := strings.LastIndex(signed, ".")
	if dot < 0 {
		return "", false
	}
	value, sig := signed[:dot], signed[dot+1:]
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(value))
	expected := hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(sig), []byte(expected)) {
		return "", false
	}
	return value, true
}

func isSecureRequest(r *http.Request) bool {
	return r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https"
}

func resolveSessionID(r *http.Request, secret []byte) (string, bool) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil || cookie.Value == "" {
		return generateSessionID(), true
	}
	id, ok := verifySignedValue(cookie.Value, secret)
	return id, ok
}

func currentSessionID(r *http.Request, secret []byte) (string, bool) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil || cookie.Value == "" {
		return "", false
	}
	return verifySignedValue(cookie.Value, secret)
}

func signSessionCreatedValue(sessionID string, secret []byte, createdAt time.Time) string {
	value := sessionID + ":" + strconv.FormatInt(createdAt.UnixMilli(), 10)
	return signValue(value, secret)
}

func verifySessionCreatedValue(signed string, secret []byte, sessionID string) (time.Time, bool) {
	value, ok := verifySignedValue(signed, secret)
	if !ok {
		return time.Time{}, false
	}
	separator := strings.LastIndex(value, ":")
	if separator < 0 || value[:separator] != sessionID {
		return time.Time{}, false
	}
	unixMillis, err := strconv.ParseInt(value[separator+1:], 10, 64)
	if err != nil || unixMillis <= 0 {
		return time.Time{}, false
	}
	return time.UnixMilli(unixMillis), true
}

func sessionCreatedAt(r *http.Request, secret []byte, sessionID string) (time.Time, bool) {
	cookie, err := r.Cookie(sessionCreatedCookieName)
	if err != nil || cookie.Value == "" {
		return time.Time{}, false
	}
	return verifySessionCreatedValue(cookie.Value, secret, sessionID)
}

func setSessionCookie(w http.ResponseWriter, r *http.Request, secret []byte, sessionID string) {
	createdAt := time.Now()
	if existingSessionID, ok := currentSessionID(r, secret); ok && existingSessionID == sessionID {
		if existingCreatedAt, ok := sessionCreatedAt(r, secret, sessionID); ok {
			createdAt = existingCreatedAt
		}
	}
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    signValue(sessionID, secret),
		MaxAge:   sessionCookieMaxAge,
		Path:     "/",
		HttpOnly: true,
		Secure:   isSecureRequest(r),
		SameSite: http.SameSiteLaxMode,
	})
	setSessionCreatedCookie(w, r, secret, sessionID, createdAt)
}

func setSessionCreatedCookie(
	w http.ResponseWriter,
	r *http.Request,
	secret []byte,
	sessionID string,
	createdAt time.Time,
) {
	http.SetCookie(w, sessionCreatedCookie(r, secret, sessionID, createdAt))
}

func sessionCreatedCookie(
	r *http.Request,
	secret []byte,
	sessionID string,
	createdAt time.Time,
) *http.Cookie {
	return &http.Cookie{
		Name:     sessionCreatedCookieName,
		Value:    signSessionCreatedValue(sessionID, secret, createdAt),
		MaxAge:   sessionCookieMaxAge,
		Path:     "/",
		HttpOnly: true,
		Secure:   isSecureRequest(r),
		SameSite: http.SameSiteLaxMode,
	}
}

func matureCookiePayload(sessionID string) string {
	return sessionID + ":show_mature"
}

func maturePreferenceEnabled(r *http.Request, secret []byte) bool {
	sessionID, ok := currentSessionID(r, secret)
	if !ok {
		return false
	}

	cookie, err := r.Cookie(matureCookieName)
	if err != nil || cookie.Value == "" {
		return false
	}
	payload, ok := verifySignedValue(cookie.Value, secret)
	return ok && payload == matureCookiePayload(sessionID)
}

func setMaturePreferenceCookie(w http.ResponseWriter, r *http.Request, secret []byte, sessionID string) {
	http.SetCookie(w, &http.Cookie{
		Name:     matureCookieName,
		Value:    signValue(matureCookiePayload(sessionID), secret),
		MaxAge:   sessionCookieMaxAge,
		Path:     "/",
		HttpOnly: true,
		Secure:   isSecureRequest(r),
		SameSite: http.SameSiteLaxMode,
	})
}

func clearMaturePreferenceCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     matureCookieName,
		Value:    "",
		MaxAge:   -1,
		Path:     "/",
		HttpOnly: true,
		Secure:   isSecureRequest(r),
		SameSite: http.SameSiteLaxMode,
	})
}
