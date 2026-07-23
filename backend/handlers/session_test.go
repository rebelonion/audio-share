package handlers

import (
	"net/http/httptest"
	"testing"
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
	if len(cookies) != 1 {
		t.Fatalf("got %d cookies, want 1", len(cookies))
	}
	cookie := cookies[0]
	if !cookie.HttpOnly || !cookie.Secure || cookie.Path != "/" {
		t.Fatalf("cookie missing security attributes: %#v", cookie)
	}
}
