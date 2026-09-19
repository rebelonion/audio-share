package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

func TestArtworkCacheReconcilesSharedDirectory(t *testing.T) {
	dir := t.TempDir()
	first := &artworkCache{dir: dir, limit: 20}
	second := &artworkCache{dir: dir, limit: 20}
	if err := first.init(); err != nil {
		t.Fatal(err)
	}
	if err := second.init(); err != nil {
		t.Fatal(err)
	}
	if err := first.write("first.jpg", make([]byte, 10)); err != nil {
		t.Fatal(err)
	}
	if _, err := second.read("first.jpg"); err != nil {
		t.Fatal(err)
	}
	if readArtworkState(t, dir).Bytes != 10 {
		t.Fatal("external write not accounted")
	}
	if err := first.write("unseen.jpg", make([]byte, 10)); err != nil {
		t.Fatal(err)
	}
	if err := second.write("second.jpg", make([]byte, 10)); err != nil {
		t.Fatal(err)
	}
	if got := artworkDiskBytes(t, dir); got != 20 {
		t.Fatalf("disk bytes=%d, want 20", got)
	}
	if readArtworkState(t, dir).Bytes != 20 {
		t.Fatalf("total=%d, want 20", readArtworkState(t, dir).Bytes)
	}
	if _, err := os.Stat(filepath.Join(dir, "first.jpg")); !os.IsNotExist(err) {
		t.Fatalf("oldest file not evicted: %v", err)
	}
	if _, err := first.read("first.jpg"); !os.IsNotExist(err) {
		t.Fatalf("read deleted file: %v", err)
	}
	// Reconciliation must also catch deletion without an intervening read.
	if err := os.Remove(filepath.Join(dir, "unseen.jpg")); err != nil {
		t.Fatal(err)
	}
	if err := second.write("unseen.jpg", make([]byte, 10)); err != nil {
		t.Fatal(err)
	}
	if readArtworkState(t, dir).Bytes != 20 || artworkDiskBytes(t, dir) != 20 {
		t.Fatal("regenerated entry counted twice")
	}
	if _, err := os.Stat(filepath.Join(dir, "second.jpg")); err != nil {
		t.Fatalf("unnecessary eviction: %v", err)
	}
}

func TestArtworkCacheExternalReplacementAndDuplicateWrite(t *testing.T) {
	dir := t.TempDir()
	cache := &artworkCache{dir: dir, limit: 30}
	if err := cache.write("same.jpg", make([]byte, 10)); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "same.jpg"), make([]byte, 15), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := cache.read("same.jpg"); err != nil {
		t.Fatal(err)
	}
	state := readArtworkState(t, dir)
	state.Checked = time.Time{}
	encoded, err := json.Marshal(state)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, artworkStateFile), encoded, 0600); err != nil {
		t.Fatal(err)
	}
	if err := cache.write("same.jpg", make([]byte, 10)); err != nil {
		t.Fatal(err)
	}
	if readArtworkState(t, dir).Bytes != 15 || artworkDiskBytes(t, dir) != 15 {
		t.Fatal("duplicate publication counted twice")
	}
	if err := cache.write("oversized.jpg", make([]byte, 31)); err != nil {
		t.Fatal(err)
	}
	if artworkDiskBytes(t, dir) != 15 {
		t.Fatal("oversized entry exceeded budget or evicted existing artwork")
	}
}

func TestArtworkCacheSharedVolumeProcesses(t *testing.T) {
	dir := t.TempDir()
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	var commands []*exec.Cmd
	var outputs []*bytes.Buffer
	for worker := 0; worker < 3; worker++ {
		cmd := exec.Command(executable, "-test.run=^TestArtworkCacheWriterProcess$")
		cmd.Env = append(os.Environ(), "ARTWORK_TEST_DIR="+dir, fmt.Sprintf("ARTWORK_TEST_WORKER=%d", worker))
		output := new(bytes.Buffer)
		cmd.Stdout = output
		cmd.Stderr = output
		if err := cmd.Start(); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = cmd.Process.Kill() })
		commands = append(commands, cmd)
		outputs = append(outputs, output)
	}
	for i, cmd := range commands {
		if err := cmd.Wait(); err != nil {
			t.Fatalf("worker %d: %v\n%s", i, err, outputs[i])
		}
	}
	if got := artworkDiskBytes(t, dir); got != 256 {
		t.Fatalf("shared disk usage=%d, want 256", got)
	}
}

func TestArtworkCacheWriterProcess(t *testing.T) {
	dir := os.Getenv("ARTWORK_TEST_DIR")
	if dir == "" {
		t.Skip("subprocess helper")
	}
	cache := &artworkCache{dir: dir, limit: 256}
	worker := os.Getenv("ARTWORK_TEST_WORKER")
	if err := cache.init(); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 20; i++ {
		if err := cache.write(fmt.Sprintf("%s-%d.jpg", worker, i), make([]byte, 64)); err != nil {
			t.Fatal(err)
		}
	}
}

func artworkDiskBytes(t *testing.T, dir string) int64 {
	t.Helper()
	files, err := artworkFiles(dir)
	if err != nil {
		t.Fatal(err)
	}
	var total int64
	for _, file := range files {
		info, err := file.Info()
		if err != nil {
			t.Fatal(err)
		}
		total += info.Size()
	}
	return total
}

func readArtworkState(t *testing.T, dir string) artworkState {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(dir, artworkStateFile))
	if err != nil {
		t.Fatal(err)
	}
	var state artworkState
	if err := json.Unmarshal(data, &state); err != nil {
		t.Fatal(err)
	}
	return state
}
