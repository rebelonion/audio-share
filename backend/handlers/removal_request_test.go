package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/onion/audio-share-backend/services"
)

type capturingSearchExecutor struct {
	opts services.SearchOptions
}

func (s *capturingSearchExecutor) Search(_ string, _, _ int, opts services.SearchOptions) ([]services.SearchResult, int, error) {
	s.opts = opts
	return []services.SearchResult{}, 0, nil
}

func TestIsLocalRequest(t *testing.T) {
	tests := []struct {
		name       string
		remoteAddr string
		headers    map[string]string
		want       bool
	}{
		{name: "loopback", remoteAddr: "127.0.0.1:8080", want: true},
		{name: "private ipv4", remoteAddr: "192.168.1.4:8080", want: true},
		{name: "private ipv6", remoteAddr: "[fd00::4]:8080", want: true},
		{name: "public", remoteAddr: "203.0.113.8:8080", want: false},
		{
			name:       "proxy client overrides local peer",
			remoteAddr: "127.0.0.1:8080",
			headers:    map[string]string{"CF-Connecting-IP": "203.0.113.8"},
			want:       false,
		},
		{
			name:       "public peer cannot claim private forwarded client",
			remoteAddr: "203.0.113.8:8080",
			headers:    map[string]string{"X-Forwarded-For": "10.0.0.9, 203.0.113.8"},
			want:       false,
		},
		{
			name:       "private forwarded client through local proxy",
			remoteAddr: "172.18.0.2:8080",
			headers:    map[string]string{"X-Forwarded-For": "10.0.0.9, 172.18.0.2"},
			want:       true,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "https://example.test/", nil)
			request.RemoteAddr = test.remoteAddr
			for key, value := range test.headers {
				request.Header.Set(key, value)
			}
			if got := isLocalRequest(request); got != test.want {
				t.Fatalf("isLocalRequest() = %v, want %v", got, test.want)
			}
		})
	}
}

func TestVisibleDirectoryContentsFiltersRemovalRequestsWithoutMutatingSource(t *testing.T) {
	requestedAt := "2026-08-14T12:00:00Z"
	contents := &services.DirectoryContents{
		CurrentPath: "Audio",
		Items: []services.FileSystemItem{
			{Name: "available.mp3", Type: "audio"},
			{Name: "requested.mp3", Type: "audio", RemovalRequestedAt: &requestedAt},
			{Name: "Folder", Type: "folder"},
		},
	}

	public := visibleDirectoryContents(contents, false)
	if len(public.Items) != 2 || public.Items[0].Name != "available.mp3" || public.Items[1].Type != "folder" {
		t.Fatalf("unexpected public contents: %#v", public.Items)
	}
	if len(contents.Items) != 3 {
		t.Fatalf("source contents were mutated: %#v", contents.Items)
	}
	local := visibleDirectoryContents(contents, true)
	if local != contents {
		t.Fatal("local access should retain the original directory contents")
	}
}

func TestSearchResponsePropagatesRemovalVisibility(t *testing.T) {
	for _, includeRemovalRequested := range []bool{false, true} {
		service := &capturingSearchExecutor{}
		if _, err := searchResponseForValues(service, url.Values{"q": {"track"}}, includeRemovalRequested); err != nil {
			t.Fatal(err)
		}
		if service.opts.IncludeRemovalRequested != includeRemovalRequested {
			t.Fatalf("IncludeRemovalRequested = %v, want %v", service.opts.IncludeRemovalRequested, includeRemovalRequested)
		}
	}
}

func TestAudioMetaRedactsRemovalRequestedAudioForExternalClients(t *testing.T) {
	requestedAt := time.Date(2026, time.August, 14, 12, 0, 0, 0, time.UTC)
	row := &audioRow{
		path:               "Audio/track.mp3",
		removalRequestedAt: sql.NullTime{Time: requestedAt, Valid: true},
		thumbnail:          sql.NullString{String: "cover.jpg", Valid: true},
		title:              sql.NullString{String: "Private title", Valid: true},
		artist:             sql.NullString{String: "Private artist", Valid: true},
		description:        sql.NullString{String: "Private description", Valid: true},
	}

	externalRequest := httptest.NewRequest(http.MethodGet, "https://example.test/share/track-key", nil)
	external := audioMetaFromRow(externalRequest, nil, row)
	if external.RemovalRequestedAt == nil || external.LocalAccess || external.Title != "" || external.Thumbnail {
		t.Fatalf("external metadata was not redacted: %#v", external)
	}

	localRequest := httptest.NewRequest(http.MethodGet, "https://example.test/share/track-key", nil)
	localRequest.RemoteAddr = "192.168.1.5:8080"
	local := audioMetaFromRow(localRequest, nil, row)
	if !local.LocalAccess || local.Title != "Private title" || !local.Thumbnail {
		t.Fatalf("local metadata was not retained: %#v", local)
	}
}

func TestAudioAccessRejectsRemovalRequestedAudioForExternalClients(t *testing.T) {
	manager := newTestHandlerAccessKeyManager(t, "10/1m")
	handler, mock := newMockAudioHandler(t, nil, manager)
	requestedAt := time.Date(2026, time.August, 14, 12, 0, 0, 0, time.UTC)
	mock.ExpectQuery(regexp.QuoteMeta(`
		SELECT id, path, deleted, unavailable_at, removal_requested_at, thumbnail, title, meta_artist, upload_date,
		       webpage_url, description, age_limit, parent_path
		FROM audio_files WHERE share_key = $1
	`)).
		WithArgs("track-key").
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "path", "deleted", "unavailable_at", "removal_requested_at", "thumbnail", "title",
			"meta_artist", "upload_date", "webpage_url", "description", "age_limit", "parent_path",
		}).AddRow(1, "audio/track.mp3", 0, nil, requestedAt, nil, nil, nil, nil, nil, nil, nil, nil))

	request := signedAudioRequest(
		http.MethodPost,
		"https://example.test/api/audio/key/track-key/access",
		`{"purpose":"stream"}`,
		"test-secret",
		"session-one",
	)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusGone || !strings.Contains(recorder.Body.String(), "removal_requested") {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
}

func TestRemovalRequestedThumbnailIsNeverPubliclyCacheable(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "cover.jpg"), []byte("cover"), 0600); err != nil {
		t.Fatal(err)
	}
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	handler := NewAudioHandler(services.NewFileSystemService(dir+":Audio"), db, AudioHandlerOptions{})
	requestedAt := time.Date(2026, time.August, 14, 12, 0, 0, 0, time.UTC)
	expectLookup := func() {
		mock.ExpectQuery(regexp.QuoteMeta(`
			SELECT id, path, deleted, unavailable_at, removal_requested_at, thumbnail, title, meta_artist, upload_date,
			       webpage_url, description, age_limit, parent_path
			FROM audio_files WHERE share_key = $1
		`)).
			WithArgs("track-key").
			WillReturnRows(sqlmock.NewRows([]string{
				"id", "path", "deleted", "unavailable_at", "removal_requested_at", "thumbnail", "title",
				"meta_artist", "upload_date", "webpage_url", "description", "age_limit", "parent_path",
			}).AddRow(1, "audio/track.mp3", 0, nil, requestedAt, "cover.jpg", nil, nil, nil, nil, nil, nil, nil))
	}

	expectLookup()
	externalRequest := httptest.NewRequest(http.MethodGet, "https://example.test/api/audio/key/track-key/thumbnail", nil)
	externalRecorder := httptest.NewRecorder()
	handler.ServeHTTP(externalRecorder, externalRequest)
	if externalRecorder.Code != http.StatusGone {
		t.Fatalf("external status = %d, want %d", externalRecorder.Code, http.StatusGone)
	}
	if got := externalRecorder.Header().Get("Cache-Control"); got != "private, no-store" {
		t.Fatalf("external Cache-Control = %q, want private, no-store", got)
	}

	expectLookup()
	localRequest := httptest.NewRequest(http.MethodGet, "https://example.test/api/audio/key/track-key/thumbnail", nil)
	localRequest.RemoteAddr = "10.0.0.5:8080"
	localRecorder := httptest.NewRecorder()
	handler.ServeHTTP(localRecorder, localRequest)
	if localRecorder.Code != http.StatusOK {
		t.Fatalf("local status = %d, want %d; body = %q", localRecorder.Code, http.StatusOK, localRecorder.Body.String())
	}
	if got := localRecorder.Header().Get("Cache-Control"); got != "private, no-store" {
		t.Fatalf("local Cache-Control = %q, want private, no-store", got)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestRemovalRequestedWaveformIsNotPubliclyCacheableForLocalClients(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	handler := NewAudioHandler(nil, db, AudioHandlerOptions{})
	requestedAt := time.Date(2026, time.August, 14, 12, 0, 0, 0, time.UTC)
	mock.ExpectQuery("SELECT id, removal_requested_at FROM audio_files").
		WithArgs("track-key").
		WillReturnRows(sqlmock.NewRows([]string{"id", "removal_requested_at"}).AddRow(1, requestedAt))
	mock.ExpectQuery("SELECT peaks, duration_seconds FROM waveform_cache").
		WithArgs(int64(1)).
		WillReturnRows(sqlmock.NewRows([]string{"peaks", "duration_seconds"}).AddRow("AQID", 30.0))

	request := httptest.NewRequest(http.MethodGet, "https://example.test/api/audio/key/track-key/waveform", nil)
	request.RemoteAddr = "10.0.0.5:8080"
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body = %q", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	if got := recorder.Header().Get("Cache-Control"); got != "private, no-store" {
		t.Fatalf("Cache-Control = %q, want private, no-store", got)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestAdminCanSetAndClearRemovalRequest(t *testing.T) {
	tests := []struct {
		name string
		body string
		arg  any
	}{
		{name: "set", body: `{"removalRequested":true}`, arg: sqlmock.AnyArg()},
		{name: "clear", body: `{"removalRequested":false}`, arg: nil},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			mock.ExpectExec("UPDATE audio_files SET removal_requested_at").
				WithArgs(test.arg, "track-key").
				WillReturnResult(sqlmock.NewResult(0, 1))

			handler := NewAdminHandler(db, nil)
			request := httptest.NewRequest(
				http.MethodPatch,
				"https://example.test/api/admin/audio/track-key/removal-request",
				strings.NewReader(test.body),
			)
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, request)

			if recorder.Code != http.StatusOK {
				t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
			}
			var response map[string]bool
			if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil || !response["success"] {
				t.Fatalf("unexpected response: %#v, err=%v", response, err)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestSPASnapshotHidesRemovalRequestedAudioExternally(t *testing.T) {
	requestedAt := "2026-08-14T12:00:00Z"
	contents := &services.DirectoryContents{Items: []services.FileSystemItem{
		{Name: "available.mp3", Type: "audio", ShareKey: "available-key"},
		{Name: "requested.mp3", Type: "audio", ShareKey: "requested-key", RemovalRequestedAt: &requestedAt},
	}}

	externalHandler := newSnapshotTestHandler(t, SPAHandlerOptions{SearchService: snapshotSearchStub{directory: contents}})
	externalRequest := httptest.NewRequest(http.MethodGet, "https://example.test/", nil)
	externalRecorder := httptest.NewRecorder()
	externalHandler.ServeHTTP(externalRecorder, externalRequest)
	externalResponses := initialResponsesFromHTML(t, externalRecorder.Body.String())
	var externalContents services.DirectoryContents
	if err := json.Unmarshal(externalResponses["/api/browse"].Body, &externalContents); err != nil {
		t.Fatal(err)
	}
	if len(externalContents.Items) != 1 || externalContents.Items[0].ShareKey != "available-key" {
		t.Fatalf("unexpected external initial data: %#v", externalContents.Items)
	}

	localHandler := newSnapshotTestHandler(t, SPAHandlerOptions{SearchService: snapshotSearchStub{directory: contents}})
	localRequest := httptest.NewRequest(http.MethodGet, "https://example.test/", nil)
	localRequest.RemoteAddr = "10.0.0.5:8080"
	localRecorder := httptest.NewRecorder()
	localHandler.ServeHTTP(localRecorder, localRequest)
	localResponses := initialResponsesFromHTML(t, localRecorder.Body.String())
	var localContents services.DirectoryContents
	if err := json.Unmarshal(localResponses["/api/browse"].Body, &localContents); err != nil {
		t.Fatal(err)
	}
	if len(localContents.Items) != 2 {
		t.Fatalf("unexpected local initial data: %#v", localContents.Items)
	}
}
