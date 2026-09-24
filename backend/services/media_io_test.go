package services

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"syscall"
	"testing"
	"time"
)

func waitMediaWorkers(t *testing.T, pool *mediaFileIO) {
	t.Helper()
	deadline := time.After(time.Second)
	for len(pool.slots) != 0 {
		select {
		case <-deadline:
			t.Fatal("filesystem worker did not finish cleanup")
		case <-time.After(time.Millisecond):
		}
	}
}

func TestMediaIOCancellationKeepsBlockedWorkBounded(t *testing.T) {
	pool := newMediaFileIO(1)
	started, release := make(chan struct{}), make(chan struct{})
	var once sync.Once
	unblock := func() { once.Do(func() { close(release) }) }
	t.Cleanup(unblock)
	var calls atomic.Int64
	work := func() ([]byte, error) { calls.Add(1); close(started); <-release; return []byte("late"), nil }
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() { _, err := runMediaIO(ctx, pool, "sidecar.info.json", work, nil); done <- err }()
	<-started
	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("error=%v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("request waited for blocked read")
	}
	if len(pool.slots) != 1 {
		t.Fatal("cancellation prematurely freed blocked worker")
	}
	var wg sync.WaitGroup
	for range 50 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := runMediaIO(context.Background(), pool, "another.info.json", work, nil)
			if !errors.Is(err, ErrMediaIOBusy) {
				t.Errorf("saturated request error=%v", err)
			}
		}()
	}
	wg.Wait()
	if calls.Load() != 1 {
		t.Fatalf("started %d blocked reads", calls.Load())
	}
	unblock()
	waitMediaWorkers(t, pool)
	value, err := runMediaIO(context.Background(), pool, "healthy", func() (int, error) { return 7, nil }, nil)
	if err != nil || value != 7 {
		t.Fatalf("pool did not recover: %d %v", value, err)
	}
}

func TestMediaIODeadlineCoversStatAndOpenCleanup(t *testing.T) {
	for _, operation := range []string{"stat", "open"} {
		t.Run(operation, func(t *testing.T) {
			fs := NewFileSystemService(t.TempDir() + ":Audio")
			fs.mediaIO = newMediaFileIO(1)
			full := filepath.Join(fs.audioDirs[0].Path, "track.m4a")
			if err := os.WriteFile(full, []byte("audio"), 0600); err != nil {
				t.Fatal(err)
			}
			started, release := make(chan struct{}), make(chan struct{})
			var once sync.Once
			unblock := func() { once.Do(func() { close(release) }) }
			t.Cleanup(unblock)
			var opened *os.File
			if operation == "stat" {
				fs.mediaIO.stat = func(path string) (os.FileInfo, error) { close(started); <-release; return os.Stat(path) }
			} else {
				fs.mediaIO.open = func(path string) (openedMedia, error) {
					media, err := openRegularMedia(path)
					opened = media.file
					close(started)
					<-release
					return media, err
				}
			}
			ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
			defer cancel()
			done := make(chan error, 1)
			go func() {
				var err error
				if operation == "stat" {
					_, err = fs.StatMedia(ctx, full)
				} else {
					_, _, err = fs.OpenMedia(ctx, full)
				}
				done <- err
			}()
			<-started
			select {
			case err := <-done:
				if !errors.Is(err, context.DeadlineExceeded) {
					t.Fatalf("error=%v", err)
				}
			case <-time.After(time.Second):
				t.Fatal("filesystem operation ignored deadline")
			}
			unblock()
			waitMediaWorkers(t, fs.mediaIO)
			if operation == "open" {
				if opened == nil {
					t.Fatal("test did not open file")
				}
				if _, err := opened.Stat(); !errors.Is(err, os.ErrClosed) {
					t.Fatalf("abandoned file was not closed: %v", err)
				}
			}
		})
	}
}

func TestMediaSidecarRejectsNonregularFiles(t *testing.T) {
	for _, kind := range []string{"fifo", "directory"} {
		t.Run(kind, func(t *testing.T) {
			dir := t.TempDir()
			sidecar := filepath.Join(dir, "track.info.json")
			var err error
			if kind == "fifo" {
				err = syscall.Mkfifo(sidecar, 0600)
			} else {
				err = os.Mkdir(sidecar, 0700)
			}
			if err != nil {
				t.Fatal(err)
			}
			pool := newMediaFileIO(1)
			ctx, cancel := context.WithTimeout(context.Background(), time.Second)
			defer cancel()
			_, err = runMediaIO(ctx, pool, sidecar, func() ([]byte, error) { return pool.readSidecar(sidecar) }, nil)
			if err == nil || errors.Is(err, context.DeadlineExceeded) {
				t.Fatalf("nonregular sidecar was not immediately rejected: %v", err)
			}
			waitMediaWorkers(t, pool)
		})
	}
}

func TestMediaIOErrorReporting(t *testing.T) {
	for _, tc := range []struct {
		err   error
		cause string
	}{{context.DeadlineExceeded, "timeout"}, {ErrMediaIOBusy, "unavailable"}} {
		event := ErrorEvent{}
		ctx := context.WithValue(context.Background(), errorContextKey{}, &event)
		AnnotateMediaIOError(ctx, tc.err, "audio/track.info.json")
		if event.Cause != tc.cause || event.Outcome != "blocked" || event.Context.Resource != "audio/track.info.json" || event.Context.Message == "" {
			t.Fatalf("missing diagnostic context: %#v", event)
		}
	}
}
