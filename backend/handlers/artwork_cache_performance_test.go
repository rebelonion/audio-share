package handlers

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestArtworkCacheInsertionsReuseSharedCount(t *testing.T) {
	dir := t.TempDir()
	first := &artworkCache{dir: dir, limit: 1 << 20}
	second := &artworkCache{dir: dir, limit: 1 << 20}
	if err := first.write("seed.jpg", make([]byte, 64)); err != nil {
		t.Fatal(err)
	}
	checked := readArtworkState(t, dir).Checked
	for i := 0; i < 200; i++ {
		cache := first
		if i%2 == 1 {
			cache = second
		}
		if err := cache.write(fmt.Sprintf("%d.jpg", i), make([]byte, 64)); err != nil {
			t.Fatal(err)
		}
	}
	state := readArtworkState(t, dir)
	if !state.Checked.Equal(checked) {
		t.Fatal("insertions triggered a full directory reconciliation")
	}
	if state.Bytes != 201*64 || artworkDiskBytes(t, dir) != state.Bytes {
		t.Fatal("shared byte count drifted")
	}
}

func TestArtworkCacheHitsDoNotWaitForWriters(t *testing.T) {
	dir := t.TempDir()
	writer := &artworkCache{dir: dir, limit: 1024}
	want := []byte("cached image")
	if err := writer.write("cached.jpg", want); err != nil {
		t.Fatal(err)
	}
	lock, err := writer.lockDisk()
	if err != nil {
		t.Fatal(err)
	}
	defer lock.Close()
	// Even a newly started instance can serve a hit while another writer holds the lock.
	reader := &artworkCache{dir: dir, limit: 1024}
	result := make(chan error, 1)
	go func() {
		data, err := reader.read("cached.jpg")
		if err == nil && !bytes.Equal(data, want) {
			err = fmt.Errorf("unexpected cached data")
		}
		result <- err
	}()
	select {
	case err := <-result:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("cache hit waited for writer bookkeeping")
	}
}

func TestArtworkCacheEvictionReservesSpace(t *testing.T) {
	dir := t.TempDir()
	cache := &artworkCache{dir: dir, limit: 1000}
	for i := 0; i < 100; i++ {
		if err := cache.write(fmt.Sprintf("%d.jpg", i), make([]byte, 10)); err != nil {
			t.Fatal(err)
		}
	}
	if err := cache.write("overflow.jpg", make([]byte, 10)); err != nil {
		t.Fatal(err)
	}
	state := readArtworkState(t, dir)
	if state.Bytes != 910 {
		t.Fatalf("eviction did not reserve space: %d", state.Bytes)
	}
	for i := 0; i < 9; i++ {
		if err := cache.write(fmt.Sprintf("next-%d.jpg", i), make([]byte, 10)); err != nil {
			t.Fatal(err)
		}
	}
	next := readArtworkState(t, dir)
	if !next.Checked.Equal(state.Checked) {
		t.Fatal("reserved space still required per-insertion scans")
	}
	if next.Bytes != 1000 || artworkDiskBytes(t, dir) != 1000 {
		t.Fatal("eviction accounting drifted")
	}
}

func TestArtworkCacheRecoversInterruptedPublication(t *testing.T) {
	dir := t.TempDir()
	cache := &artworkCache{dir: dir, limit: 30}
	if err := cache.write("first.jpg", make([]byte, 10)); err != nil {
		t.Fatal(err)
	}
	// Simulate a writer stopping after publishing the JPEG but before committing the count.
	if err := os.Remove(filepath.Join(dir, artworkStateFile)); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "interrupted.jpg"), make([]byte, 10), 0600); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"artwork-image.tmp", "artwork-state.tmp", "unrelated.tmp"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("partial write"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Mkdir(filepath.Join(dir, "artwork-directory.tmp"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := cache.write("next.jpg", make([]byte, 10)); err != nil {
		t.Fatal(err)
	}
	if state := readArtworkState(t, dir); state.Bytes != 30 {
		t.Fatalf("recovered count=%d, want 30", state.Bytes)
	}
	if artworkDiskBytes(t, dir) != 30 {
		t.Fatal("recovery unnecessarily evicted artwork")
	}
	for _, name := range []string{"artwork-image.tmp", "artwork-state.tmp"} {
		if _, err := os.Stat(filepath.Join(dir, name)); !os.IsNotExist(err) {
			t.Fatalf("abandoned file %s retained: %v", name, err)
		}
	}
	for _, name := range []string{"unrelated.tmp", "artwork-directory.tmp", ".artwork.lock", artworkStateFile} {
		if _, err := os.Stat(filepath.Join(dir, name)); err != nil {
			t.Fatalf("cleanup removed %s: %v", name, err)
		}
	}

}

func BenchmarkArtworkCacheInsertion(b *testing.B) {
	for _, count := range []int{1000, 10000} {
		b.Run(fmt.Sprint(count), func(b *testing.B) {
			cache := &artworkCache{dir: b.TempDir(), limit: artworkCacheLimit}
			data := make([]byte, 100)
			for i := 0; i < count; i++ {
				if err := cache.write(fmt.Sprintf("seed-%d.jpg", i), data); err != nil {
					b.Fatal(err)
				}
			}
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				if err := cache.write(fmt.Sprintf("new-%d.jpg", i), data); err != nil {
					b.Fatal(err)
				}
			}
		})
	}
}
