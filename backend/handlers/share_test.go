package handlers

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/onion/audio-share-backend/services"
)

type stubSourceNormalizer struct {
	result *services.NormalizedSource
	err    error
}

func (s *stubSourceNormalizer) IsConfigured() bool { return true }

func (s *stubSourceNormalizer) Normalize(context.Context, string) (*services.NormalizedSource, error) {
	return s.result, s.err
}

type stubSourceRequestLookup struct {
	existing *services.ExistingSourceRequest
	err      error
}

func (s *stubSourceRequestLookup) FindExistingSource(string, string) (*services.ExistingSourceRequest, error) {
	return s.existing, s.err
}

func youtubeNormalizerResult() *services.NormalizedSource {
	return &services.NormalizedSource{
		SourceKey:    "youtube:UC_x5XG1OV2P6uZZ5FSM9Ttw",
		CanonicalURL: "https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw",
		Platform:     "youtube",
		Title:        "Example",
	}
}

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
		&stubSourceRequestLookup{},
		&stubSourceNormalizer{result: youtubeNormalizerResult()},
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
		"New source request: https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw",
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
		&stubSourceRequestLookup{},
		&stubSourceNormalizer{result: youtubeNormalizerResult()},
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

func TestShareReturnsConflictWithoutNotificationForExistingSource(t *testing.T) {
	notificationSent := false
	notificationServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		notificationSent = true
		w.WriteHeader(http.StatusOK)
	}))
	defer notificationServer.Close()

	handler := NewShareHandler(
		services.NewNtfyService(notificationServer.URL, "requests", "", 3, ""),
		&stubSourceRequestLookup{existing: &services.ExistingSourceRequest{
			ID:           42,
			SubmittedURL: youtubeNormalizerResult().CanonicalURL,
			Title:        "Example",
			Status:       "added",
		}},
		&stubSourceNormalizer{result: youtubeNormalizerResult()},
	)
	request := httptest.NewRequest(
		http.MethodPost,
		"https://example.test/api/share",
		strings.NewReader(`{"requestUrl": "https://m.youtube.com/@example"}`),
	)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusConflict {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if notificationSent {
		t.Fatal("notification was sent for an existing source")
	}
	if !strings.Contains(recorder.Body.String(), "already in the archive") {
		t.Fatalf("unexpected response body: %s", recorder.Body.String())
	}
}

func TestShareReturnsNormalizerValidationError(t *testing.T) {
	handler := NewShareHandler(
		services.NewNtfyService("https://ntfy.example", "requests", "", 3, ""),
		&stubSourceRequestLookup{},
		&stubSourceNormalizer{err: &services.SourceNormalizationError{
			Code:    "unsupported_platform",
			Message: "Please enter a supported creator URL.",
		}},
	)
	request := httptest.NewRequest(
		http.MethodPost,
		"https://example.test/api/share",
		strings.NewReader(`{"requestUrl": "https://example.com/creator"}`),
	)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
}
