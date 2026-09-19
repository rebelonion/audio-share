package handlers

import (
	"bytes"
	"context"
	"image"
	"image/jpeg"
	"os"
	"path/filepath"
	"testing"
)

func TestArtworkCacheDirectoryRecovery(t *testing.T) {
	for _, variant := range []string{"card-v2", "blur-v2"} {
		for _, failure := range []string{"initial obstruction", "removed directory"} {
			t.Run(variant+"/"+failure, func(t *testing.T) {
				source := filepath.Join(t.TempDir(), "source.jpg")
				if err := writeJPEG(source, image.NewRGBA(image.Rect(0, 0, 720, 480))); err != nil {
					t.Fatal(err)
				}
				info, err := os.Stat(source)
				if err != nil {
					t.Fatal(err)
				}
				dir := filepath.Join(t.TempDir(), "cache")
				cache := &artworkCache{dir: dir, limit: artworkCacheLimit, slots: make(chan struct{}, 2)}
				if failure == "initial obstruction" {
					if err := os.WriteFile(dir, []byte("obstruction"), 0600); err != nil {
						t.Fatal(err)
					}
					if _, err := cache.get(context.Background(), source, info, variant); err == nil {
						t.Fatal("expected cache error")
					}
					if err := os.Remove(dir); err != nil {
						t.Fatal(err)
					}
				} else {
					if _, err := cache.get(context.Background(), source, info, variant); err != nil {
						t.Fatal(err)
					}
					if err := os.RemoveAll(dir); err != nil {
						t.Fatal(err)
					}
				}
				data, err := cache.get(context.Background(), source, info, variant)
				if err != nil {
					t.Fatalf("cache did not recover without restart: %v", err)
				}
				cfg, err := jpeg.DecodeConfig(bytes.NewReader(data))
				if err != nil {
					t.Fatal(err)
				}
				if cfg.Width != 360 || cfg.Height != 240 {
					t.Fatalf("unexpected recovered image: %+v", cfg)
				}
				if count := readArtworkState(t, dir).Bytes; count != int64(len(data)) {
					t.Fatalf("recovered cache bytes=%d, want %d", count, len(data))
				}
			})
		}
	}
}
