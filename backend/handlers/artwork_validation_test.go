package handlers

import (
	"bytes"
	"image"
	"image/color"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestGeneratedArtworkRevalidation(t *testing.T) {
	previous := cachedArtwork
	cachedArtwork = &artworkCache{dir: t.TempDir(), limit: artworkCacheLimit, slots: make(chan struct{}, 2)}
	defer func() { cachedArtwork = previous }()
	for _, variant := range []string{"card", "blur"} {
		t.Run(variant, func(t *testing.T) {
			source := filepath.Join(t.TempDir(), "cover.jpg")
			sourceTime := time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)
			writeSource := func(c color.RGBA) {
				t.Helper()
				img := image.NewRGBA(image.Rect(0, 0, 720, 480))
				for y := 0; y < 480; y++ {
					for x := 0; x < 720; x++ {
						img.SetRGBA(x, y, c)
					}
				}
				if err := writeJPEG(source, img); err != nil {
					t.Fatal(err)
				}
				if err := os.Chtimes(source, sourceTime, sourceTime); err != nil {
					t.Fatal(err)
				}
			}
			writeSource(color.RGBA{R: 230, A: 255})
			request := func(etag, modified string) *httptest.ResponseRecorder {
				t.Helper()
				info, err := os.Stat(source)
				if err != nil {
					t.Fatal(err)
				}
				r := httptest.NewRequest(http.MethodGet, "/thumbnail?size=card", nil)
				if etag != "" {
					r.Header.Set("If-None-Match", etag)
				}
				if modified != "" {
					r.Header.Set("If-Modified-Since", modified)
				}
				w := httptest.NewRecorder()
				if variant == "card" {
					if !serveCardArtwork(w, r, source, info, "private, max-age=86400") {
						t.Fatal("card fell back to original")
					}
				} else {
					(&AudioHandler{}).serveBlurredThumbnail(w, r, source, info, false)
				}
				return w
			}
			// Old generated timestamps are newer than the source, even when content has changed.
			legacyTime := sourceTime.Add(24 * time.Hour).Format(http.TimeFormat)
			initial := request("", legacyTime)
			if initial.Code != http.StatusOK || initial.Body.Len() == 0 {
				t.Fatalf("legacy timestamp returned %d with %d bytes", initial.Code, initial.Body.Len())
			}
			etag := initial.Header().Get("ETag")
			if etag == "" || initial.Header().Get("Last-Modified") != "" {
				t.Fatal("expected ETag without timestamp validator")
			}
			matching := request(etag, legacyTime)
			if matching.Code != http.StatusNotModified || matching.Body.Len() != 0 {
				t.Fatalf("matching ETag returned %d", matching.Code)
			}
			if matching.Header().Get("ETag") != etag || matching.Header().Get("Cache-Control") != "private, max-age=86400" {
				t.Fatal("304 lost caching headers")
			}
			// Represent an old placeholder or thumbnail from a different transformation.
			stale := request(`"old-placeholder"`, legacyTime)
			if stale.Code != http.StatusOK || !bytes.Equal(stale.Body.Bytes(), initial.Body.Bytes()) {
				t.Fatal("old ETag retained stale artwork")
			}
			sourceTime = sourceTime.Add(time.Hour)
			writeSource(color.RGBA{B: 230, A: 255})
			changed := request(etag, legacyTime)
			if changed.Code != http.StatusOK || changed.Header().Get("ETag") == etag || bytes.Equal(changed.Body.Bytes(), initial.Body.Bytes()) {
				t.Fatal("changed artwork was not refreshed")
			}
			revalidated := request(changed.Header().Get("ETag"), "")
			if revalidated.Code != http.StatusNotModified {
				t.Fatalf("new ETag returned %d", revalidated.Code)
			}
		})
	}
}
