package handlers

import (
	"net/http/httptest"
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
