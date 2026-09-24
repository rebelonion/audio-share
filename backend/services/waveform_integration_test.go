package services

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestIntegrationWaveformStalledStatReleasesJobLock(t *testing.T) {
	f := newMediaFixture(t)
	for _, name := range []string{"ffmpeg", "ffprobe"} {
		if _, err := exec.LookPath(name); err != nil {
			t.Skip(name + " required for waveform integration")
		}
	}
	full := filepath.Join(f.dir, "track.wav")
	cmd := exec.Command("ffmpeg", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", full)
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("generate audio: %v: %s", err, output)
	}
	if err := os.WriteFile(filepath.Join(f.dir, "track.info.json"), []byte(`{}`), 0600); err != nil {
		t.Fatal(err)
	}
	f.index(t)

	// Reserve a separate session so a leaked session lock cannot be reacquired reentrantly.
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	probe, err := f.db.db.Conn(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer probe.Close()
	f.fs.mediaIO = newMediaFileIO(1)
	started, release := make(chan struct{}), make(chan struct{})
	var once sync.Once
	unblock := func() { once.Do(func() { close(release) }) }
	defer unblock()
	f.fs.mediaIO.stat = func(path string) (os.FileInfo, error) {
		close(started)
		<-release
		return os.Stat(path)
	}
	s := NewWaveformService(f.db.db, f.fs, 1)
	s.Errors = NewErrorReporter(f.db.db, "test", ErrorPolicy{}, nil)
	done := make(chan error, 1)
	go func() { done <- s.RunJob(time.Minute) }()
	select {
	case <-started:
	case err := <-done:
		t.Fatalf("job bypassed bounded filesystem validation: %v", err)
	case <-ctx.Done():
		t.Fatal("job never reached filesystem validation")
	}
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(MediaPreparationTimeout + 3*time.Second):
		t.Fatal("job waited for the stalled stat")
	}
	if len(f.fs.mediaIO.slots) != 1 {
		t.Fatal("stalled syscall no longer occupies its bounded worker slot")
	}
	if got := f.db.db.Stats().InUse; got != 1 {
		t.Fatalf("database connections still in use = %d, want only the probe", got)
	}
	tx, err := probe.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	var acquired bool
	if err := tx.QueryRowContext(ctx, `SELECT pg_try_advisory_xact_lock(hashtextextended('audio-share/job/waveform', 0))`).Scan(&acquired); err != nil || !acquired {
		t.Fatalf("waveform job lock was not released: acquired=%v err=%v", acquired, err)
	}
	if err := tx.Rollback(); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := probe.QueryRowContext(ctx, `SELECT count(*) FROM waveform_cache`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("unvalidated waveform published: count=%d err=%v", count, err)
	}
	var raw []byte
	if err := probe.QueryRowContext(ctx, `SELECT context FROM error_reports WHERE operation='waveform' AND cause='partial-failure'`).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var details ErrorContext
	if err := json.Unmarshal(raw, &details); err != nil {
		t.Fatal(err)
	}
	if details.FailureCounts["stat"] != 1 || len(details.Failures) != 1 || !strings.Contains(details.Failures[0].Message, "context deadline exceeded") {
		t.Fatalf("missing stat timeout diagnostics: %s", raw)
	}
	unblock()
	waitMediaWorkers(t, f.fs.mediaIO)
	f.fs.mediaIO.stat = os.Stat
	if err := s.RunJob(time.Minute); err != nil {
		t.Fatal(err)
	}
	if err := probe.QueryRowContext(ctx, `SELECT count(*) FROM waveform_cache`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("subsequent job did not recover: count=%d err=%v", count, err)
	}
}
