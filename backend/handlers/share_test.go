package handlers

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/onion/audio-share-backend/services"
)

func TestShareNotificationIncludesHigherRemovalRisk(t *testing.T) {
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

	handler := NewShareHandler(
		services.NewNtfyService(notificationServer.URL, "requests", "", 3, ""),
	)
	request := httptest.NewRequest(
		http.MethodPost,
		"https://example.test/api/share",
		strings.NewReader(`{
			"requestUrl": "https://youtube.com/@example",
			"hasHigherRemovalRisk": true
		}`),
	)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	for _, expected := range []string{
		"New source request: https://youtube.com/@example",
		"Content removal risk: Higher",
	} {
		if !strings.Contains(notificationBody, expected) {
			t.Errorf("notification body missing %q:\n%s", expected, notificationBody)
		}
	}
}

func TestShareNotificationOmitsHigherRemovalRiskWhenNotSelected(t *testing.T) {
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

	handler := NewShareHandler(
		services.NewNtfyService(notificationServer.URL, "requests", "", 3, ""),
	)
	request := httptest.NewRequest(
		http.MethodPost,
		"https://example.test/api/share",
		strings.NewReader(`{"requestUrl": "https://youtube.com/@example"}`),
	)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if strings.Contains(notificationBody, "Content removal risk") {
		t.Errorf("notification body unexpectedly includes removal risk:\n%s", notificationBody)
	}
}
