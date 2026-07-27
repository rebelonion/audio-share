package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestSignedSessionRoundTripAndTamperRejection(t *testing.T) {
	secret := []byte("test-secret")
	signed := signValue("profile-id", secret)
	value, ok := verifySignedValue(signed, secret)
	if !ok || value != "profile-id" {
		t.Fatalf("signed value did not round trip: value=%q ok=%v", value, ok)
	}
	if _, ok := verifySignedValue(signed+"tampered", secret); ok {
		t.Fatal("tampered signature was accepted")
	}
}

func TestSessionCookieSecurityAttributes(t *testing.T) {
	request := httptest.NewRequest("GET", "https://example.test/api/profile", nil)
	recorder := httptest.NewRecorder()
	setSessionCookie(recorder, request, []byte("secret"), "profile-id")
	cookies := recorder.Result().Cookies()
	if len(cookies) != 2 {
		t.Fatalf("got %d cookies, want 2", len(cookies))
	}
	for _, cookie := range cookies {
		if !cookie.HttpOnly || !cookie.Secure || cookie.Path != "/" {
			t.Fatalf("cookie missing security attributes: %#v", cookie)
		}
	}
}

func TestSessionBootstrapCreatesAndPreservesSignedSession(t *testing.T) {
	secret := "test-secret"
	handler := NewSessionBootstrapHandler(secret)

	firstRequest := httptest.NewRequest(http.MethodPost, "https://example.test/api/session", nil)
	firstRecorder := httptest.NewRecorder()
	handler.ServeHTTP(firstRecorder, firstRequest)
	if firstRecorder.Code != http.StatusNoContent {
		t.Fatalf("bootstrap status = %d, want 204", firstRecorder.Code)
	}
	cookies := firstRecorder.Result().Cookies()
	if len(cookies) != 2 {
		t.Fatalf("bootstrap set %d cookies, want 2", len(cookies))
	}
	sessionCookie := cookieByName(t, cookies, sessionCookieName)
	createdCookie := cookieByName(t, cookies, sessionCreatedCookieName)
	sessionID, ok := verifySignedValue(sessionCookie.Value, []byte(secret))
	if !ok || sessionID == "" {
		t.Fatal("bootstrap did not create a valid signed session")
	}
	createdAt, ok := verifySessionCreatedValue(createdCookie.Value, []byte(secret), sessionID)
	if !ok || createdAt.After(time.Now()) {
		t.Fatal("bootstrap did not create a valid session age")
	}

	secondRequest := httptest.NewRequest(http.MethodPost, "https://example.test/api/session", nil)
	secondRequest.AddCookie(sessionCookie)
	secondRequest.AddCookie(createdCookie)
	secondRecorder := httptest.NewRecorder()
	handler.ServeHTTP(secondRecorder, secondRequest)
	if secondRecorder.Code != http.StatusNoContent {
		t.Fatalf("existing session status = %d, want 204", secondRecorder.Code)
	}
	if len(secondRecorder.Result().Cookies()) != 0 {
		t.Fatal("valid existing session was unnecessarily replaced")
	}
}

func TestSessionBootstrapReplacesInvalidCookie(t *testing.T) {
	handler := NewSessionBootstrapHandler("test-secret")
	request := httptest.NewRequest(http.MethodPost, "https://example.test/api/session", nil)
	request.AddCookie(&http.Cookie{Name: sessionCookieName, Value: "invalid"})
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", recorder.Code)
	}
	cookies := recorder.Result().Cookies()
	if len(cookies) != 2 {
		t.Fatalf("set %d cookies, want 2", len(cookies))
	}
	if _, ok := verifySignedValue(cookieByName(t, cookies, sessionCookieName).Value, []byte("test-secret")); !ok {
		t.Fatal("replacement cookie is invalid")
	}
}

func TestSessionBootstrapAddsCreationTimeToLegacySession(t *testing.T) {
	secret := []byte("test-secret")
	handler := NewSessionBootstrapHandler(string(secret))
	request := httptest.NewRequest(http.MethodPost, "https://example.test/api/session", nil)
	request.AddCookie(&http.Cookie{
		Name:  sessionCookieName,
		Value: signValue("legacy-session", secret),
	})
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	cookies := recorder.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != sessionCreatedCookieName {
		t.Fatalf("bootstrap cookies = %#v, want only creation-time cookie", cookies)
	}
	if _, ok := verifySessionCreatedValue(cookies[0].Value, secret, "legacy-session"); !ok {
		t.Fatal("creation-time cookie is invalid")
	}
}

func TestSessionBootstrapRejectsOtherMethods(t *testing.T) {
	handler := NewSessionBootstrapHandler("test-secret")
	request := httptest.NewRequest(http.MethodGet, "https://example.test/api/session", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", recorder.Code)
	}
}

func cookieByName(t *testing.T, cookies []*http.Cookie, name string) *http.Cookie {
	t.Helper()
	for _, cookie := range cookies {
		if cookie.Name == name {
			return cookie
		}
	}
	t.Fatalf("cookie %q not found in %#v", name, cookies)
	return nil
}
