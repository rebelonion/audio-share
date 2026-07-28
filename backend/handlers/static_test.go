package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

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
