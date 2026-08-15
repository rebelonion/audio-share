package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/onion/audio-share-backend/services"
)

type snapshotSearchStub struct {
	directory *services.DirectoryContents
	stats     *services.SummaryStats
	results   []services.SearchResult
	total     int
}

func (s snapshotSearchStub) BrowseDirectory(string) (*services.DirectoryContents, error) {
	return s.directory, nil
}

func (s snapshotSearchStub) GetSummaryStats() (*services.SummaryStats, error) {
	return s.stats, nil
}

func (snapshotSearchStub) GetAudioStats() (*services.AudioStats, error) {
	return &services.AudioStats{}, nil
}

func (snapshotSearchStub) GetUnavailableStats() (*services.UnavailableStats, error) {
	return &services.UnavailableStats{}, nil
}

func (snapshotSearchStub) GetSourcesStats() (*services.SourcesStats, error) {
	return &services.SourcesStats{}, nil
}

func (snapshotSearchStub) GetDurationStats() (*services.DurationStats, error) {
	return &services.DurationStats{}, nil
}

func (snapshotSearchStub) GetPublicationYearStats() (*services.PublicationYearStats, error) {
	return &services.PublicationYearStats{}, nil
}

func (snapshotSearchStub) GetSourceAvailabilityStats() (*services.SourceAvailabilityStats, error) {
	return &services.SourceAvailabilityStats{}, nil
}

func (s snapshotSearchStub) Search(string, int, int, services.SearchOptions) ([]services.SearchResult, int, error) {
	return s.results, s.total, nil
}

type snapshotRequestsStub struct {
	requests *services.RequestsByStatus
}

func (s snapshotRequestsStub) GetAllGroupedByStatus() (*services.RequestsByStatus, error) {
	return s.requests, nil
}

func newSnapshotTestHandler(t *testing.T, options ...SPAHandlerOptions) *SPAHandler {
	t.Helper()
	staticDir := t.TempDir()
	indexHTML := `<!doctype html><html><head><title>Audio Share</title></head><body><div id="root"></div></body></html>`
	if err := os.WriteFile(filepath.Join(staticDir, "index.html"), []byte(indexHTML), 0o600); err != nil {
		t.Fatal(err)
	}
	return NewSPAHandler(staticDir, FrontendConfig{
		DefaultTitle:       "Test Archive",
		DefaultDescription: "Test description",
	}, "", "", nil, options...)
}

func initialResponsesFromHTML(t *testing.T, body string) initialResponses {
	t.Helper()
	const prefix = `<script id="server-initial-data" type="application/json">`
	start := strings.Index(body, prefix)
	if start < 0 {
		t.Fatalf("response does not contain initial data: %s", body)
	}
	start += len(prefix)
	end := strings.Index(body[start:], "</script>")
	if end < 0 {
		t.Fatalf("initial data script is not closed: %s", body)
	}
	var responses initialResponses
	if err := json.Unmarshal([]byte(body[start:start+end]), &responses); err != nil {
		t.Fatalf("invalid initial data: %v", err)
	}
	return responses
}

func TestNewLibraryRoutesHavePageMetadata(t *testing.T) {
	handler := &SPAHandler{config: FrontendConfig{
		DefaultTitle:       "Test Archive",
		DefaultDescription: "Test description",
	}}

	for _, path := range []string{"/likes", "/recover"} {
		request := httptest.NewRequest("GET", "https://example.test"+path, nil)
		meta := handler.getPageMeta(request)
		if meta.notFound {
			t.Errorf("route %s was treated as not found", path)
		}
		if meta.title == "" || meta.h1 == "" {
			t.Errorf("route %s missing metadata: %#v", path, meta)
		}
	}
}

func TestBrowseRouteRequiresPathBoundary(t *testing.T) {
	handler := newSnapshotTestHandler(t)
	request := httptest.NewRequest(http.MethodGet, "https://example.test/browser-extension", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusNotFound)
	}
	if body := recorder.Body.String(); !strings.Contains(body, "The page you are looking for does not exist") {
		t.Fatalf("response does not contain the not-found snapshot: %s", body)
	}
}

func TestSPAHandlerInjectsBuildIDAndDoesNotCacheHTML(t *testing.T) {
	staticDir := t.TempDir()
	indexHTML := `<!doctype html><html><head><title>Audio Share</title></head><body><div id="root"></div></body></html>`
	if err := os.WriteFile(filepath.Join(staticDir, "index.html"), []byte(indexHTML), 0o600); err != nil {
		t.Fatal(err)
	}

	handler := NewSPAHandler(staticDir, FrontendConfig{
		DefaultTitle:       "Test Archive",
		DefaultDescription: "Test description",
		BuildID:            "build-123",
	}, "", "", nil)

	request := httptest.NewRequest(http.MethodGet, "https://example.test/", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if got := recorder.Header().Get("Cache-Control"); got != "no-cache" {
		t.Fatalf("Cache-Control = %q, want no-cache", got)
	}
	if !strings.Contains(recorder.Body.String(), `"buildId":"build-123"`) {
		t.Fatalf("response does not contain injected build ID: %s", recorder.Body.String())
	}
}

func TestSPAHandlerCachesHashedAssetsImmutably(t *testing.T) {
	staticDir := t.TempDir()
	assetsDir := filepath.Join(staticDir, "assets")
	if err := os.Mkdir(assetsDir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(assetsDir, "app-123.js"), []byte("export {};"), 0o600); err != nil {
		t.Fatal(err)
	}

	handler := NewSPAHandler(staticDir, FrontendConfig{}, "", "", nil)
	request := httptest.NewRequest(http.MethodGet, "https://example.test/assets/app-123.js", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if got := recorder.Header().Get("Cache-Control"); got != "public, max-age=31536000, immutable" {
		t.Fatalf("Cache-Control = %q, want immutable asset caching", got)
	}
}

func TestVersionHandlerReturnsUncachedBuildID(t *testing.T) {
	handler := &SPAHandler{config: FrontendConfig{BuildID: "build-456"}}
	request := httptest.NewRequest(http.MethodGet, "https://example.test/api/version", nil)
	recorder := httptest.NewRecorder()

	handler.VersionHandler()(recorder, request)

	if got := recorder.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store", got)
	}
	if got := recorder.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("Content-Type = %q, want application/json", got)
	}

	var response map[string]string
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatal(err)
	}
	if got := response["buildId"]; got != "build-456" {
		t.Fatalf("buildId = %q, want build-456", got)
	}
}

func TestSPAHandlerRendersVisibleStaticPageContent(t *testing.T) {
	contentDir := t.TempDir()
	about := "# A real about page\n\nThis content is available without JavaScript.\n\n<script>alert('no')</script>"
	if err := os.WriteFile(filepath.Join(contentDir, "about.md"), []byte(about), 0o600); err != nil {
		t.Fatal(err)
	}
	handler := newSnapshotTestHandler(t, SPAHandlerOptions{ContentDir: contentDir})

	tests := []struct {
		path string
		want string
	}{
		{path: "/about", want: "This content is available without JavaScript."},
		{path: "/contact", want: "Send us a comment, question, or report."},
		{path: "/recover", want: "Use a recovery key"},
		{path: "/missing", want: "The page you are looking for does not exist"},
	}
	for _, test := range tests {
		t.Run(test.path, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "https://example.test"+test.path, nil)
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, request)
			body := recorder.Body.String()
			if !strings.Contains(body, `data-server-snapshot`) {
				t.Fatalf("response does not include server snapshot: %s", body)
			}
			if !strings.Contains(body, "Enable JavaScript to play audio and use the full interactive experience.") {
				t.Fatalf("response does not include JavaScript notice: %s", body)
			}
			if test.path == "/about" && !strings.Contains(body, `class="snapshot-markdown`) {
				t.Fatalf("response does not include snapshot Markdown styling hook: %s", body)
			}
			if !strings.Contains(body, test.want) {
				t.Fatalf("response does not include %q: %s", test.want, body)
			}
			if strings.Contains(body, "<script>alert('no')</script>") {
				t.Fatalf("raw Markdown HTML was rendered: %s", body)
			}
		})
	}
}

func TestSPAHandlerRendersPublicDataSnapshots(t *testing.T) {
	search := snapshotSearchStub{
		directory: &services.DirectoryContents{Items: []services.FileSystemItem{
			{Name: "A folder", Path: "Audio/A folder", Type: "folder"},
			{Name: "track.mp3", Title: "A track", Type: "audio", ShareKey: "track-key"},
		}},
		stats: &services.SummaryStats{
			TotalFiles:       12,
			TotalSources:     3,
			TotalDuration:    7200,
			TotalStorage:     2_500_000_000,
			TotalUnavailable: 1,
		},
		results: []services.SearchResult{{Name: "Matching track", Type: "audio", ShareKey: "match-key"}},
		total:   1,
	}
	requests := snapshotRequestsStub{requests: &services.RequestsByStatus{
		Requested: []services.SourceRequest{{
			Title:        "Requested source",
			SubmittedURL: "https://example.com/source",
			CreatedAt:    "2026-08-10T12:00:00Z",
		}},
	}}
	handler := newSnapshotTestHandler(t, SPAHandlerOptions{
		SearchService:   search,
		RequestsService: requests,
	})

	tests := []struct {
		path string
		want []string
	}{
		{path: "/", want: []string{"A folder", "/browse/Audio/A%20folder", "A track", "/share/track-key"}},
		{path: "/stats", want: []string{"Total files", "12", "2.5 GB"}},
		{path: "/requests", want: []string{"Requested source", "Requested · 2026-08-10"}},
		{path: "/search?q=matching", want: []string{`1 results for &#34;matching&#34;.`, "Matching track", "/share/match-key"}},
	}
	for _, test := range tests {
		t.Run(test.path, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "https://example.test"+test.path, nil)
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, request)
			for _, want := range test.want {
				if !strings.Contains(recorder.Body.String(), want) {
					t.Fatalf("response does not include %q: %s", want, recorder.Body.String())
				}
			}
		})
	}
}

func TestSPAHandlerEmbedsSearchResponseForFrontend(t *testing.T) {
	handler := newSnapshotTestHandler(t, SPAHandlerOptions{SearchService: snapshotSearchStub{
		results: []services.SearchResult{{Name: "Matching track", Type: "audio", ShareKey: "match-key"}},
		total:   1,
	}})
	request := httptest.NewRequest(http.MethodGet, "https://example.test/search?q=matching", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	responses := initialResponsesFromHTML(t, recorder.Body.String())
	initial, ok := responses["/api/search?limit=50&q=matching"]
	if !ok {
		t.Fatalf("search response missing from initial data: %#v", responses)
	}
	var response SearchResponse
	if err := json.Unmarshal(initial.Body, &response); err != nil {
		t.Fatal(err)
	}
	if response.Total != 1 || len(response.Results) != 1 || response.Results[0].ShareKey != "match-key" {
		t.Fatalf("unexpected initial search response: %#v", response)
	}
}

func TestSPAHandlerCapsVisibleSnapshotItems(t *testing.T) {
	items := make([]services.FileSystemItem, maxSnapshotItems+5)
	for i := range items {
		items[i] = services.FileSystemItem{Name: fmt.Sprintf("Track %03d", i), Type: "audio"}
	}
	handler := newSnapshotTestHandler(t, SPAHandlerOptions{SearchService: snapshotSearchStub{
		directory: &services.DirectoryContents{Items: items},
	}})
	request := httptest.NewRequest(http.MethodGet, "https://example.test/", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	body := recorder.Body.String()
	if got := strings.Count(body, "<li>"); got != maxSnapshotItems {
		t.Fatalf("visible snapshot items = %d, want %d", got, maxSnapshotItems)
	}
	if !strings.Contains(body, "5 more items are available") {
		t.Fatalf("response does not disclose truncated items: %s", body)
	}
	responses := initialResponsesFromHTML(t, body)
	var contents services.DirectoryContents
	if err := json.Unmarshal(responses["/api/browse"].Body, &contents); err != nil {
		t.Fatal(err)
	}
	if len(contents.Items) != len(items) {
		t.Fatalf("initial directory items = %d, want %d", len(contents.Items), len(items))
	}
}

func TestSPAHandlerReusesShareLookupForMetadataAndInitialData(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	mock.ExpectQuery("SELECT id, path, deleted, unavailable_at, removal_requested_at, thumbnail, title, meta_artist, upload_date").
		WithArgs("track-key").
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "path", "deleted", "unavailable_at", "removal_requested_at", "thumbnail", "title", "meta_artist", "upload_date",
			"webpage_url", "description", "age_limit", "parent_path",
		}).AddRow(
			1, "Audio/track.mp3", 0, nil, nil, "cover.jpg", "Track title", "Artist", "20260810",
			"https://example.test/source", "Description", 0, "Audio",
		))
	handler := newSnapshotTestHandler(t)
	handler.db = db
	request := httptest.NewRequest(http.MethodGet, "https://example.test/share/track-key", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
	responses := initialResponsesFromHTML(t, recorder.Body.String())
	initial, ok := responses["/api/audio/key/track-key/meta"]
	if !ok {
		t.Fatalf("share metadata missing from initial data: %#v", responses)
	}
	var meta AudioMeta
	if err := json.Unmarshal(initial.Body, &meta); err != nil {
		t.Fatal(err)
	}
	if meta.Title != "Track title" || meta.Artist != "Artist" || !meta.Thumbnail {
		t.Fatalf("unexpected initial share metadata: %#v", meta)
	}
}
