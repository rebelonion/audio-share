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

func TestIntegrationWaveformStoresAndBackfillsChapters(t *testing.T) {
	f := newMediaFixture(t)
	for _, name := range []string{"ffmpeg", "ffprobe"} {
		if _, err := exec.LookPath(name); err != nil {
			t.Skip(name + " required for waveform integration")
		}
	}
	meta := ";FFMETADATA1\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=400\ntitle=Intro\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=400\nEND=1000\ntitle=Outro\n"
	metaPath := filepath.Join(t.TempDir(), "chapters.txt")
	if err := os.WriteFile(metaPath, []byte(meta), 0600); err != nil {
		t.Fatal(err)
	}
	full := filepath.Join(f.dir, "track.m4a")
	cmd := exec.Command("ffmpeg", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-i", metaPath, "-map_metadata", "1", "-c:a", "aac", full)
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("generate audio: %v: %s", err, output)
	}
	if err := os.WriteFile(filepath.Join(f.dir, "track.info.json"), []byte(`{}`), 0600); err != nil {
		t.Fatal(err)
	}
	f.index(t)

	s := NewWaveformService(f.db.db, f.fs, 1)
	s.Errors = NewErrorReporter(f.db.db, "test", ErrorPolicy{}, nil)
	readChapters := func() []Chapter {
		var raw []byte
		if err := f.db.db.QueryRow(`SELECT chapters FROM waveform_cache`).Scan(&raw); err != nil {
			t.Fatal(err)
		}
		var chapters []Chapter
		if err := json.Unmarshal(raw, &chapters); err != nil {
			t.Fatalf("decode %s: %v", raw, err)
		}
		return chapters
	}
	expect := func(chapters []Chapter) {
		if len(chapters) != 2 || chapters[0].Title != "Intro" || chapters[1].Title != "Outro" || chapters[1].Start != 0.4 {
			t.Fatalf("unexpected chapters %+v", chapters)
		}
	}

	if err := s.RunJob(time.Minute); err != nil {
		t.Fatal(err)
	}
	expect(readChapters())

	// Waveforms generated before chapter support are probed without regenerating peaks.
	if _, err := f.db.db.Exec(`UPDATE waveform_cache SET chapters = NULL, chapters_probed_at = NULL, peaks = 'legacy'`); err != nil {
		t.Fatal(err)
	}
	if err := s.RunJob(time.Minute); err != nil {
		t.Fatal(err)
	}
	expect(readChapters())
	var peaks string
	if err := f.db.db.QueryRow(`SELECT peaks FROM waveform_cache`).Scan(&peaks); err != nil || peaks != "legacy" {
		t.Fatalf("peaks = %q, %v; backfill must not regenerate waveforms", peaks, err)
	}
}

// A fake ffprobe that fails chapter probes but defers everything else to the real binary.
func installFailingChapterProbe(t *testing.T) {
	t.Helper()
	real, err := exec.LookPath("ffprobe")
	if err != nil {
		t.Skip("ffprobe required")
	}
	dir := t.TempDir()
	script := "#!/bin/sh\nfor a in \"$@\"; do [ \"$a\" = -show_chapters ] && { echo 'simulated chapter failure' >&2; exit 1; }; done\nexec " + real + " \"$@\"\n"
	if err := os.WriteFile(filepath.Join(dir, "ffprobe"), []byte(script), 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))
}

func TestIntegrationWaveformRetriesFailedChapterProbesWithBackoff(t *testing.T) {
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
	realPath := os.Getenv("PATH")
	installFailingChapterProbe(t)

	s := NewWaveformService(f.db.db, f.fs, 1)
	s.Errors = NewErrorReporter(f.db.db, "test", ErrorPolicy{}, nil)
	run := func() JobSummary {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		conn, err := f.db.db.Conn(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer conn.Close()
		var summary JobSummary
		if err := s.runJob(conn, time.Minute, &summary); err != nil {
			t.Fatal(err)
		}
		return summary
	}
	state := func() (chapters []byte, probed bool) {
		var probedAt *time.Time
		if err := f.db.db.QueryRow(`SELECT chapters, chapters_probed_at FROM waveform_cache`).Scan(&chapters, &probedAt); err != nil {
			t.Fatal(err)
		}
		return chapters, probedAt != nil
	}

	// First run: waveform stored, probe fails once, no same-run backfill retry.
	summary := run()
	if summary.Attempted != 1 || summary.Processed != 1 || summary.Issues != 1 {
		t.Fatalf("first run summary = %+v, want 1 attempted, 1 processed, 1 issue", summary)
	}
	if chapters, probed := state(); chapters != nil || !probed {
		t.Fatalf("after failed probe chapters=%q probed=%v; want NULL and a probe timestamp", chapters, probed)
	}

	// Second run inside the backoff window: nothing to do, no repeated issue.
	if summary = run(); summary.Attempted != 0 || summary.Issues != 0 {
		t.Fatalf("run inside backoff = %+v, want idle", summary)
	}

	// Once the backoff lapses the probe is retried and the failure is reported again.
	if _, err := f.db.db.Exec(`UPDATE waveform_cache SET chapters_probed_at = NOW() - INTERVAL '2 days'`); err != nil {
		t.Fatal(err)
	}
	if summary = run(); summary.Attempted != 1 || summary.Processed != 0 || summary.Issues != 1 {
		t.Fatalf("run after backoff = %+v, want 1 attempted, 1 issue", summary)
	}

	// With ffprobe healthy again the retry succeeds and records an empty list.
	t.Setenv("PATH", realPath)
	if _, err := f.db.db.Exec(`UPDATE waveform_cache SET chapters_probed_at = NOW() - INTERVAL '2 days'`); err != nil {
		t.Fatal(err)
	}
	if summary = run(); summary.Attempted != 1 || summary.Processed != 1 || summary.Issues != 0 {
		t.Fatalf("recovered run = %+v, want 1 processed", summary)
	}
	if chapters, _ := state(); string(chapters) != "[]" {
		t.Fatalf("recovered chapters = %q, want []", chapters)
	}

	// A path that no longer resolves is also stamped, so it backs off instead of failing every run.
	if _, err := f.db.db.Exec(`UPDATE waveform_cache SET chapters = NULL, chapters_probed_at = NULL`); err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.db.Exec(`UPDATE audio_files SET path = 'missing-mount/track.wav'`); err != nil {
		t.Fatal(err)
	}
	if summary = run(); summary.Attempted != 1 || summary.Issues != 1 {
		t.Fatalf("unresolvable path run = %+v, want 1 attempted, 1 issue", summary)
	}
	if chapters, probed := state(); chapters != nil || !probed {
		t.Fatalf("after unresolvable path chapters=%q probed=%v; want NULL and a probe timestamp", chapters, probed)
	}
	if summary = run(); summary.Attempted != 0 || summary.Issues != 0 {
		t.Fatalf("unresolvable path inside backoff = %+v, want idle", summary)
	}
}
