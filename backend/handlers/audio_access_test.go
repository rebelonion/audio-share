package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/onion/audio-share-backend/services"
)

func TestAudioAccessEndpointIssuesScopedKeyAndEnforcesLimit(t *testing.T) {
	manager, err := services.NewAccessKeyManager(
		"test-secret",
		"1/1m",
		"1/1m",
		30*time.Minute,
		10*time.Minute,
	)
	if err != nil {
		t.Fatalf("NewAccessKeyManager: %v", err)
	}
	handler, mock := newMockAudioHandler(t, nil, manager)

	for range 2 {
		expectAudioLookup(mock, "track-key", "audio/track.mp3", false)
	}

	first := signedAudioRequest(
		http.MethodPost,
		"https://example.test/api/audio/key/track-key/access",
		`{"purpose":"stream"}`,
		"test-secret",
		"session-one",
	)
	firstRecorder := httptest.NewRecorder()
	handler.ServeHTTP(firstRecorder, first)
	if firstRecorder.Code != http.StatusOK {
		t.Fatalf("first issuance status = %d, body=%s", firstRecorder.Code, firstRecorder.Body.String())
	}
	var response struct {
		AccessKey   string    `json:"accessKey"`
		ExpiresAt   time.Time `json:"expiresAt"`
		ExpiresInMS int64     `json:"expiresInMs"`
	}
	if err := json.NewDecoder(firstRecorder.Body).Decode(&response); err != nil {
		t.Fatalf("decode issuance response: %v", err)
	}
	if response.AccessKey == "" || response.ExpiresAt.IsZero() || response.ExpiresInMS <= 0 {
		t.Fatalf("incomplete issuance response: %#v", response)
	}
	if err := manager.Verify(response.AccessKey, "session-one", "track-key", services.MediaPurposeStream); err != nil {
		t.Fatalf("issued key did not verify: %v", err)
	}

	second := signedAudioRequest(
		http.MethodPost,
		"https://example.test/api/audio/key/track-key/access",
		`{"purpose":"stream"}`,
		"test-secret",
		"session-one",
	)
	secondRecorder := httptest.NewRecorder()
	handler.ServeHTTP(secondRecorder, second)
	if secondRecorder.Code != http.StatusTooManyRequests {
		t.Fatalf("second issuance status = %d, want 429", secondRecorder.Code)
	}
	if secondRecorder.Header().Get("Retry-After") == "" {
		t.Fatal("rate-limited response omitted Retry-After")
	}
}

func TestAudioAccessEndpointRequiresSignedSession(t *testing.T) {
	manager, err := services.NewAccessKeyManager(
		"test-secret",
		"10/1m",
		"10/1m",
		30*time.Minute,
		10*time.Minute,
	)
	if err != nil {
		t.Fatalf("NewAccessKeyManager: %v", err)
	}
	handler, _ := newMockAudioHandler(t, nil, manager)
	request := httptest.NewRequest(
		http.MethodPost,
		"https://example.test/api/audio/key/track-key/access",
		strings.NewReader(`{"purpose":"stream"}`),
	)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", recorder.Code)
	}
}

func TestAudioMediaRequiresMatchingAccessKey(t *testing.T) {
	manager, err := services.NewAccessKeyManager(
		"test-secret",
		"10/1m",
		"10/1m",
		30*time.Minute,
		10*time.Minute,
	)
	if err != nil {
		t.Fatalf("NewAccessKeyManager: %v", err)
	}
	audioDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(audioDir, "track.mp3"), []byte("test audio"), 0o600); err != nil {
		t.Fatalf("write audio fixture: %v", err)
	}
	fs := services.NewFileSystemService(audioDir + ":Test Audio")
	handler, mock := newMockAudioHandler(t, fs, manager)
	failureLimiter := &stubAccessFailureLimiter{allowed: true}
	handler.accessFailureLimiter = failureLimiter

	invalid := signedAudioRequest(
		http.MethodGet,
		"https://example.test/api/audio/key/track-key?access_key=invalid",
		"",
		"test-secret",
		"session-one",
	)
	invalidRecorder := httptest.NewRecorder()
	handler.ServeHTTP(invalidRecorder, invalid)
	if invalidRecorder.Code != http.StatusForbidden {
		t.Fatalf("invalid key status = %d, want 403", invalidRecorder.Code)
	}
	if failureLimiter.failures != 1 {
		t.Fatalf("invalid key recorded %d failures, want 1", failureLimiter.failures)
	}

	issued, err := manager.Issue("session-one", "192.0.2.1", "track-key", services.MediaPurposeStream)
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	expectAudioLookup(mock, "track-key", "test-audio/track.mp3", false)
	valid := signedAudioRequest(
		http.MethodHead,
		"https://example.test/api/audio/key/track-key?access_key="+issued.AccessKey,
		"",
		"test-secret",
		"session-one",
	)
	validRecorder := httptest.NewRecorder()
	handler.ServeHTTP(validRecorder, valid)
	if validRecorder.Code != http.StatusOK {
		t.Fatalf("valid key status = %d, body=%s", validRecorder.Code, validRecorder.Body.String())
	}
	if got := validRecorder.Header().Get("Cache-Control"); got != "private, no-store" {
		t.Fatalf("Cache-Control = %q", got)
	}
	if failureLimiter.failures != 1 {
		t.Fatalf("valid media request changed failure count to %d", failureLimiter.failures)
	}
}

func TestAudioMediaBlocksAfterTooManyAccessFailures(t *testing.T) {
	handler, _ := newMockAudioHandler(t, nil, nil)
	handler.accessFailureLimiter = &stubAccessFailureLimiter{
		allowed:    false,
		retryAfter: 37,
	}
	request := httptest.NewRequest(
		http.MethodGet,
		"https://example.test/api/audio/key/track-key?access_key=invalid",
		nil,
	)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429", recorder.Code)
	}
	if got := recorder.Header().Get("Retry-After"); got != "37" {
		t.Fatalf("Retry-After = %q, want 37", got)
	}
}

func TestDownloadAccessRequiresMinimumSessionAge(t *testing.T) {
	manager, err := services.NewAccessKeyManager(
		"test-secret",
		"10/1m",
		"10/1m",
		30*time.Minute,
		10*time.Minute,
	)
	if err != nil {
		t.Fatalf("NewAccessKeyManager: %v", err)
	}
	handler, mock := newMockAudioHandler(t, nil, manager)
	now := time.Date(2026, time.July, 26, 12, 0, 0, 0, time.UTC)
	handler.downloadSessionMinAge = time.Hour
	handler.now = func() time.Time { return now }

	tooYoung := signedAudioRequest(
		http.MethodPost,
		"https://example.test/api/audio/key/track-key/access",
		`{"purpose":"download"}`,
		"test-secret",
		"session-one",
	)
	tooYoung.AddCookie(sessionCreatedCookie(
		tooYoung,
		[]byte("test-secret"),
		"session-one",
		now.Add(-30*time.Minute),
	))
	tooYoungRecorder := httptest.NewRecorder()
	handler.ServeHTTP(tooYoungRecorder, tooYoung)
	if tooYoungRecorder.Code != http.StatusTooManyRequests {
		t.Fatalf("young session status = %d, body=%s", tooYoungRecorder.Code, tooYoungRecorder.Body.String())
	}
	var limited struct {
		Error      string `json:"error"`
		RetryAfter int    `json:"retryAfter"`
	}
	if err := json.NewDecoder(tooYoungRecorder.Body).Decode(&limited); err != nil {
		t.Fatalf("decode young-session response: %v", err)
	}
	if limited.Error != "session_too_new" || limited.RetryAfter != 1800 {
		t.Fatalf("young-session response = %#v", limited)
	}

	now = now.Add(30 * time.Minute)
	expectAudioLookup(mock, "track-key", "audio/track.mp3", false)
	oldEnough := signedAudioRequest(
		http.MethodPost,
		"https://example.test/api/audio/key/track-key/access",
		`{"purpose":"download"}`,
		"test-secret",
		"session-one",
	)
	oldEnough.AddCookie(sessionCreatedCookie(
		oldEnough,
		[]byte("test-secret"),
		"session-one",
		now.Add(-time.Hour),
	))
	oldEnoughRecorder := httptest.NewRecorder()
	handler.ServeHTTP(oldEnoughRecorder, oldEnough)
	if oldEnoughRecorder.Code != http.StatusOK {
		t.Fatalf("old session status = %d, body=%s", oldEnoughRecorder.Code, oldEnoughRecorder.Body.String())
	}
}

func newMockAudioHandler(
	t *testing.T,
	fs *services.FileSystemService,
	manager *services.AccessKeyManager,
) (*AudioHandler, sqlmock.Sqlmock) {
	t.Helper()
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	t.Cleanup(func() {
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Errorf("unmet database expectations: %v", err)
		}
		db.Close()
	})
	return NewAudioHandler(fs, db, AudioHandlerOptions{
		SessionSecret: "test-secret",
		AccessKeys:    manager,
	}), mock
}

func expectAudioLookup(mock sqlmock.Sqlmock, shareKey, path string, deleted bool) {
	deletedValue := 0
	if deleted {
		deletedValue = 1
	}
	mock.ExpectQuery(regexp.QuoteMeta(`
		SELECT id, path, deleted, unavailable_at, thumbnail, title, meta_artist, upload_date,
		       webpage_url, description, age_limit, parent_path
		FROM audio_files WHERE share_key = $1
	`)).
		WithArgs(shareKey).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "path", "deleted", "unavailable_at", "thumbnail", "title", "meta_artist",
			"upload_date", "webpage_url", "description", "age_limit", "parent_path",
		}).AddRow(1, path, deletedValue, nil, nil, nil, nil, nil, nil, nil, nil, nil))
}

func signedAudioRequest(method, target, body, secret, sessionID string) *http.Request {
	request := httptest.NewRequest(method, target, strings.NewReader(body))
	request.AddCookie(&http.Cookie{
		Name:  sessionCookieName,
		Value: signValue(sessionID, []byte(secret)),
	})
	return request
}

type stubAccessFailureLimiter struct {
	allowed    bool
	retryAfter int
	failures   int
}

func (l *stubAccessFailureLimiter) AllowAccessAttempt(string) (bool, int) {
	return l.allowed, l.retryAfter
}

func (l *stubAccessFailureLimiter) RecordAccessFailure(string) {
	l.failures++
}
