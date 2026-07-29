package handlers

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/onion/audio-share-backend/services"
)

func TestContactNotificationIncludesDiagnostics(t *testing.T) {
	var notificationBody string
	notificationServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("read notification body: %v", err)
		}
		notificationBody = string(body)
		w.WriteHeader(http.StatusOK)
	}))
	defer notificationServer.Close()

	const sessionSecret = "test-secret"
	handler := NewContactHandler(
		services.NewNtfyService(notificationServer.URL, "contact", "", 3, ""),
		sessionSecret,
	)
	request := httptest.NewRequest(
		http.MethodPost,
		"https://example.test/api/contact",
		strings.NewReader(`{
			"topic": "bug",
			"email": "reporter@example.test",
			"message": "Playback stopped",
			"browser": "Firefox 127.0",
			"platform": "Linux x86_64",
			"viewport": "1440x900 @ 2x",
			"screen": "2560x1440",
			"language": "en-US",
			"timezone": "America/Chicago",
			"page": "/contact?topic=bug",
			"appBuildId": "build-123"
		}`),
	)
	request.Header.Set("User-Agent", "Mozilla/5.0 Firefox/127.0")
	request.AddCookie(&http.Cookie{
		Name:  sessionCookieName,
		Value: signValue("session-123", []byte(sessionSecret)),
	})
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	for _, expected := range []string{
		"Diagnostics:",
		"Session ID: session-123",
		"Browser: Firefox 127.0",
		"Platform: Linux x86_64",
		"Viewport: 1440x900 @ 2x",
		"Screen: 2560x1440",
		"Language: en-US",
		"Timezone: America/Chicago",
		"Page: /contact?topic=bug",
		"App build: build-123",
		"User agent: Mozilla/5.0 Firefox/127.0",
	} {
		if !strings.Contains(notificationBody, expected) {
			t.Errorf("notification body missing %q:\n%s", expected, notificationBody)
		}
	}
}

func TestSanitizeDiagnosticRemovesLineBreaksAndTruncates(t *testing.T) {
	if got := sanitizeDiagnostic("  Firefox\nInjected: value  ", 12); got != "Firefox Inje" {
		t.Fatalf("sanitizeDiagnostic() = %q", got)
	}
}
