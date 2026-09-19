package handlers

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/jpeg"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/onion/audio-share-backend/services"
)

func TestCardArtworkCache(t *testing.T) {
	source := filepath.Join(t.TempDir(), "source.jpg")
	img := image.NewRGBA(image.Rect(0, 0, 1920, 1080))
	for y := 0; y < 1080; y++ {
		for x := 0; x < 1920; x++ {
			img.SetRGBA(x, y, color.RGBA{uint8(x), uint8(y), 90, 255})
		}
	}
	if err := writeJPEG(source, img); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(source)
	if err != nil {
		t.Fatal(err)
	}
	cache := &artworkCache{dir: t.TempDir(), limit: artworkCacheLimit, slots: make(chan struct{}, 2)}
	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			data, err := cache.get(context.Background(), source, info, "card-v2")
			if err != nil {
				t.Error(err)
				return
			}
			cfg, err := jpeg.DecodeConfig(bytes.NewReader(data))
			if err != nil {
				t.Error(err)
				return
			}
			if cfg.Width != 360 || cfg.Height != 202 {
				t.Errorf("dimensions: %+v", cfg)
			}
			if int64(len(data)) >= info.Size() {
				t.Error("thumbnail is not smaller")
			}
		}()
	}
	wg.Wait()
	files, err := artworkFiles(cache.dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 1 {
		t.Fatalf("got %d cache files", len(files))
	}
	original, err := os.ReadFile(filepath.Join(cache.dir, files[0].Name()))
	if err != nil {
		t.Fatal(err)
	}
	reused, err := cache.get(context.Background(), source, info, "card-v2")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(reused, original) {
		t.Fatal("cache hit changed image")
	}
	later := info.ModTime().Add(time.Second)
	if err := os.Chtimes(source, later, later); err != nil {
		t.Fatal(err)
	}
	info, _ = os.Stat(source)
	if _, err := cache.get(context.Background(), source, info, "card-v2"); err != nil {
		t.Fatal(err)
	}
	files, _ = artworkFiles(cache.dir)
	if len(files) != 2 {
		t.Fatal("source change did not create a new variant")
	}
}

func TestCardArtworkSmallAndInvalidSources(t *testing.T) {
	source := filepath.Join(t.TempDir(), "small.png")
	if err := writeJPEG(source, image.NewRGBA(image.Rect(0, 0, 32, 24))); err != nil {
		t.Fatal(err)
	}
	data, err := generateCardArtwork(source)
	if err != nil {
		t.Fatal(err)
	}
	cfg, err := jpeg.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Width != 32 || cfg.Height != 24 {
		t.Fatal("small source was enlarged")
	}
	if err := os.WriteFile(source, []byte("invalid"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := generateCardArtwork(source); err == nil {
		t.Fatal("invalid image accepted")
	}
}

func TestArtworkCachePrunesOldest(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"old.jpg", "new.jpg"} {
		if err := os.WriteFile(filepath.Join(dir, name), make([]byte, 10), 0600); err != nil {
			t.Fatal(err)
		}
	}
	past := time.Now().Add(-time.Hour)
	if err := os.Chtimes(filepath.Join(dir, "old.jpg"), past, past); err != nil {
		t.Fatal(err)
	}
	cache := &artworkCache{dir: dir, limit: 15}
	if err := cache.write("oversized.jpg", make([]byte, 16)); err != nil {
		t.Fatal(err)
	}
	if readArtworkState(t, dir).Bytes != 10 {
		t.Fatalf("cache bytes = %d", readArtworkState(t, dir).Bytes)
	}
	if _, err := os.Stat(filepath.Join(dir, "old.jpg")); !os.IsNotExist(err) {
		t.Fatal("oldest entry retained")
	}
	if _, err := os.Stat(filepath.Join(dir, "new.jpg")); err != nil {
		t.Fatal(err)
	}
}

func TestCardArtworkEndpoints(t *testing.T) {
	sourceDir := t.TempDir()
	source := filepath.Join(sourceDir, "cover.jpg")
	if err := writeJPEG(source, image.NewRGBA(image.Rect(0, 0, 1280, 720))); err != nil {
		t.Fatal(err)
	}
	previous := cachedArtwork
	cachedArtwork = &artworkCache{dir: t.TempDir(), limit: artworkCacheLimit, slots: make(chan struct{}, 2)}
	defer func() { cachedArtwork = previous }()
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	fs := services.NewFileSystemService(sourceDir + ":Audio")
	audio := NewAudioHandler(fs, db, AudioHandlerOptions{})
	for _, tc := range []struct {
		name    string
		age     any
		removed any
		status  int
		query   string
	}{
		{"normal", nil, nil, http.StatusOK, "?size=card"},
		{"mature original", 18, nil, http.StatusForbidden, "?size=card&view=original"},
		{"mature blurred", 18, nil, http.StatusOK, "?size=card&view=blurred"},
		{"removed", nil, time.Now(), http.StatusGone, "?size=card"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			mock.ExpectQuery("SELECT id, path, deleted").WithArgs("key").WillReturnRows(sqlmock.NewRows([]string{"id", "path", "deleted", "unavailable_at", "removal_requested_at", "thumbnail", "title", "meta_artist", "upload_date", "webpage_url", "description", "age_limit", "parent_path"}).AddRow(1, "audio/track.mp3", 0, nil, tc.removed, "cover.jpg", nil, nil, nil, nil, nil, tc.age, nil))
			r := httptest.NewRequest(http.MethodGet, "/api/audio/key/key/thumbnail"+tc.query, nil)
			w := httptest.NewRecorder()
			audio.ServeHTTP(w, r)
			if w.Code != tc.status {
				t.Fatalf("status %d: %s", w.Code, w.Body.String())
			}
			if w.Code == http.StatusOK {
				cfg, err := jpeg.DecodeConfig(w.Body)
				if err != nil {
					t.Fatal(err)
				}
				if cfg.Width != 360 {
					t.Fatalf("width %d", cfg.Width)
				}
				if w.Header().Get("Cache-Control") != "private, max-age=86400" {
					t.Fatal("incorrect audio caching")
				}
			}
		})
	}
	mock.ExpectQuery("SELECT path, COALESCE").WithArgs("folder").WillReturnRows(sqlmock.NewRows([]string{"path", "poster_image"}).AddRow("audio", "cover.jpg"))
	w := httptest.NewRecorder()
	NewFolderHandler(fs, db).ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/folder/key/folder/poster?size=card", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("poster status %d", w.Code)
	}
	cfg, err := jpeg.DecodeConfig(w.Body)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Width != 360 {
		t.Fatal("poster not resized")
	}
	if w.Header().Get("Cache-Control") != "public, max-age=86400" {
		t.Fatal("incorrect poster caching")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestSharedArtworkCacheUsesEnvironment(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("ARTWORK_CACHE_DIR", dir)
	source := filepath.Join(t.TempDir(), "cover.jpg")
	img := image.NewRGBA(image.Rect(0, 0, 720, 480))
	for y := 0; y < 480; y++ {
		for x := 0; x < 720; x++ {
			img.SetRGBA(x, y, color.RGBA{uint8(x), uint8(y), 90, 255})
		}
	}
	if err := writeJPEG(source, img); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(source)
	if err != nil {
		t.Fatal(err)
	}
	cache := &artworkCache{limit: artworkCacheLimit, slots: make(chan struct{}, 2)}
	card, err := cache.get(context.Background(), source, info, "card-v2")
	if err != nil {
		t.Fatal(err)
	}
	blurred, err := cache.get(context.Background(), source, info, "blur-v2")
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Equal(card, blurred) {
		t.Fatal("blurred and original variants share content")
	}
	files, err := artworkFiles(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 2 {
		t.Fatalf("shared directory contains %d files, want 2", len(files))
	}
	if readArtworkState(t, dir).Bytes != int64(len(card)+len(blurred)) {
		t.Fatal("variants do not share cache accounting")
	}
	// A new cache instance must reuse the persisted blur even if decoding cannot succeed.
	if err := os.WriteFile(source, []byte("invalid"), 0600); err != nil {
		t.Fatal(err)
	}
	restarted := &artworkCache{limit: artworkCacheLimit, slots: make(chan struct{}, 2)}
	reused, err := restarted.get(context.Background(), source, info, "blur-v2")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(reused, blurred) {
		t.Fatal("persisted blur was not reused")
	}
	info, err = os.Stat(source)
	if err != nil {
		t.Fatal(err)
	}
	placeholder, err := restarted.get(context.Background(), source, info, "blur-v2")
	if err != nil {
		t.Fatal(err)
	}
	cfg, err := jpeg.DecodeConfig(bytes.NewReader(placeholder))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Width != 360 || cfg.Height != 360 {
		t.Fatalf("invalid placeholder dimensions: %+v", cfg)
	}
	if bytes.Equal(placeholder, card) {
		t.Fatal("decode failure exposed unblurred artwork")
	}
}

func artworkFiles(dir string) ([]os.DirEntry, error) {
	files, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	images := files[:0]
	for _, file := range files {
		if filepath.Ext(file.Name()) == ".jpg" {
			images = append(images, file)
		}
	}
	return images, nil
}

func writeJPEG(path string, img image.Image) error {
	tmp := path + ".tmp"
	file, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if err := jpeg.Encode(file, img, &jpeg.Options{Quality: 72}); err != nil {
		file.Close()
		os.Remove(tmp)
		return err
	}
	if err := file.Close(); err != nil {
		os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, path)
}
