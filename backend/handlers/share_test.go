package handlers

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

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
	existing  *services.ExistingSourceRequest
	err       error
	called    bool
	sourceKey string
}

func (s *stubSourceRequestLookup) FindExistingSource(sourceKey, _ string) (*services.ExistingSourceRequest, error) {
	s.called = true
	s.sourceKey = sourceKey
	return s.existing, s.err
}

type stubShareSubmissionLog struct {
	count    int
	pending  bool
	recorded []string
}

func (s *stubShareSubmissionLog) Count(context.Context, string) (int, error) { return s.count, nil }

func (s *stubShareSubmissionLog) Record(_ context.Context, sessionID, _, _ string) error {
	s.recorded = append(s.recorded, sessionID)
	return nil
}

func (s *stubShareSubmissionLog) HasRecentSource(context.Context, string, time.Time) (bool, error) {
	return s.pending, nil
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

	submissions := &stubShareSubmissionLog{count: 3}
	handler := NewShareHandler(
		services.NewNtfyService(notificationServer.URL, "requests", "", 3, ""),
		&stubSourceRequestLookup{},
		&stubSourceNormalizer{result: youtubeNormalizerResult()},
		submissions,
		"test-secret",
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
		"Session ID: ",
		"Session requests: 4 (including this one)",
	} {
		if !strings.Contains(notificationBody, expected) {
			t.Errorf("notification body missing %q:\n%s", expected, notificationBody)
		}
	}
	if strings.Contains(notificationBody, "Normalization failed") {
		t.Errorf("normalized notification unexpectedly contains warning:\n%s", notificationBody)
	}
	if len(submissions.recorded) != 1 {
		t.Errorf("recorded %d submissions, want 1", len(submissions.recorded))
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
		&stubShareSubmissionLog{},
		"test-secret",
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

	folderPath := "Audio/Mao Chika"
	handler := NewShareHandler(
		services.NewNtfyService(notificationServer.URL, "requests", "", 3, ""),
		&stubSourceRequestLookup{existing: &services.ExistingSourceRequest{
			ID:           42,
			SubmittedURL: youtubeNormalizerResult().CanonicalURL,
			Title:        "Example",
			Status:       "added",
			FolderPath:   &folderPath,
		}},
		&stubSourceNormalizer{result: youtubeNormalizerResult()},
		&stubShareSubmissionLog{},
		"test-secret",
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
	if !strings.Contains(recorder.Body.String(), `"folderPath":"Audio/Mao Chika"`) {
		t.Fatalf("response body missing folder path: %s", recorder.Body.String())
	}
}

func TestShareReturnsConflictWithoutNotificationForPendingSubmission(t *testing.T) {
	notificationSent := false
	notificationServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		notificationSent = true
		w.WriteHeader(http.StatusOK)
	}))
	defer notificationServer.Close()

	submissions := &stubShareSubmissionLog{pending: true}
	handler := NewShareHandler(
		services.NewNtfyService(notificationServer.URL, "requests", "", 3, ""),
		&stubSourceRequestLookup{},
		&stubSourceNormalizer{result: youtubeNormalizerResult()},
		submissions,
		"test-secret",
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
		t.Fatal("notification was sent for a pending source")
	}
	if !strings.Contains(recorder.Body.String(), `"code":"source_pending"`) {
		t.Fatalf("unexpected response body: %s", recorder.Body.String())
	}
	if len(submissions.recorded) != 0 {
		t.Fatalf("recorded %d submissions for a rejected duplicate", len(submissions.recorded))
	}
}

func TestShareReturnsNormalizerValidationError(t *testing.T) {
	handler := NewShareHandler(
		services.NewNtfyService("https://ntfy.example", "requests", "", 3, ""),
		&stubSourceRequestLookup{},
		&stubSourceNormalizer{err: &services.SourceNormalizationError{
			Code:    "invalid_url",
			Message: "Please enter a valid URL.",
		}},
		&stubShareSubmissionLog{},
		"test-secret",
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

func TestShareSendsUnnormalizedNotificationWhenNormalizerIsUnavailable(t *testing.T) {
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

	lookup := &stubSourceRequestLookup{}
	handler := NewShareHandler(
		services.NewNtfyService(notificationServer.URL, "requests", "", 3, ""),
		lookup,
		&stubSourceNormalizer{err: &services.SourceNormalizationError{
			Code:    "upstream_error",
			Message: "The source page could not be loaded.",
		}},
		&stubShareSubmissionLog{},
		"test-secret",
	)
	request := httptest.NewRequest(
		http.MethodPost,
		"https://example.test/api/share",
		strings.NewReader(`{"requestUrl": "https://m.youtube.com/@example"}`),
	)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	for _, expected := range []string{
		"New source request: https://m.youtube.com/@example",
		"Normalization failed: review the submitted URL and check for duplicates manually.",
	} {
		if !strings.Contains(notificationBody, expected) {
			t.Errorf("notification body missing %q:\n%s", expected, notificationBody)
		}
	}
	if lookup.sourceKey != "url:youtube.com/@example" {
		t.Fatalf("duplicate lookup source key = %q", lookup.sourceKey)
	}
}

func TestShareDeliversUnsupportedPlatformWithWarning(t *testing.T) {
	var notificationBody, notificationTags string
	notificationServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("read notification body: %v", err)
		}
		notificationBody = string(body)
		notificationTags = r.Header.Get("X-Tags")
		w.WriteHeader(http.StatusOK)
	}))
	defer notificationServer.Close()

	lookup := &stubSourceRequestLookup{}
	submissions := &stubShareSubmissionLog{}
	handler := NewShareHandler(
		services.NewNtfyService(notificationServer.URL, "requests", "", 3, ""),
		lookup,
		&stubSourceNormalizer{err: &services.SourceNormalizationError{
			Code:    "unsupported_platform",
			Message: "Please enter a supported creator URL.",
		}},
		submissions,
		"test-secret",
	)
	request := httptest.NewRequest(
		http.MethodPost,
		"https://example.test/api/share",
		strings.NewReader(`{"requestUrl": "https://www.Example.com/Creator/?tab=videos"}`),
	)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), `"code":"unsupported_platform"`) ||
		!strings.Contains(recorder.Body.String(), `"warning":`) {
		t.Fatalf("response missing unsupported warning: %s", recorder.Body.String())
	}
	if !strings.Contains(notificationBody, "Unsupported platform") || strings.Contains(notificationBody, "Normalization failed") {
		t.Errorf("unexpected notification body:\n%s", notificationBody)
	}
	if !strings.Contains(notificationTags, "unsupported") {
		t.Errorf("notification tags = %q", notificationTags)
	}
	if lookup.sourceKey != "url:example.com/creator" {
		t.Errorf("duplicate lookup source key = %q", lookup.sourceKey)
	}
	if len(submissions.recorded) != 1 {
		t.Errorf("recorded %d submissions, want 1", len(submissions.recorded))
	}
}

func TestRoughSourceKey(t *testing.T) {
	for input, want := range map[string]string{
		"https://www.Example.com/Creator/?tab=videos": "url:example.com/creator",
		"example.com/creator":                         "url:example.com/creator",
		"https://m.kick.com/someone#live":             "url:kick.com/someone",
		"not a url":                                   "",
	} {
		if got := roughSourceKey(input); got != want {
			t.Errorf("roughSourceKey(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestShareRejectsOversizedBody(t *testing.T) {
	lookup := &stubSourceRequestLookup{}
	handler := NewShareHandler(
		services.NewNtfyService("http://127.0.0.1:1", "requests", "", 3, ""),
		lookup,
		&stubSourceNormalizer{result: youtubeNormalizerResult()},
		&stubShareSubmissionLog{},
		"test-secret",
	)
	body := `{"requestUrl":"https://example.com/","padding":"` + strings.Repeat("x", 32*1024) + `"}`
	request := httptest.NewRequest(http.MethodPost, "/api/share", strings.NewReader(body))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest || lookup.called {
		t.Fatalf("status=%d lookupCalled=%v", response.Code, lookup.called)
	}
}

func TestMaturePreferenceRejectsOversizedBody(t *testing.T) {
	handler := NewPreferencesHandler("test-session-secret").MatureContentHandler()
	body := `{"enabled":true,"padding":"` + strings.Repeat("x", 4096) + `"}`
	request := httptest.NewRequest(http.MethodPost, "/api/preferences/mature-content", strings.NewReader(body))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest || response.Header().Get("Set-Cookie") != "" {
		t.Fatalf("status=%d cookies=%q", response.Code, response.Header().Values("Set-Cookie"))
	}
}
