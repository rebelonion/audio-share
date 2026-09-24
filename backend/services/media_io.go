package services

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"syscall"
	"time"
)

const MediaPreparationTimeout = 5 * time.Second

var ErrMediaIOBusy = errors.New("media filesystem workers are busy")

// Slots are retained until the underlying syscall and resource cleanup finish,
// even if the requesting context has already expired. There is no background queue.
type mediaFileIO struct {
	slots       chan struct{}
	stat        func(string) (os.FileInfo, error)
	readSidecar func(string) ([]byte, error)
	readDir     func(string, int) ([]os.DirEntry, error)
	open        func(string) (openedMedia, error)
}

type openedMedia struct {
	file *os.File
	info os.FileInfo
}

var sharedMediaIO = newMediaFileIO(8)

func newMediaFileIO(workers int) *mediaFileIO {
	return &mediaFileIO{
		slots: make(chan struct{}, workers), stat: os.Stat, open: openRegularMedia,
		readSidecar: func(path string) ([]byte, error) {
			media, err := openRegularMedia(path)
			if err != nil {
				return nil, err
			}
			defer media.file.Close()
			return io.ReadAll(media.file)
		},
		readDir: func(path string, limit int) ([]os.DirEntry, error) {
			dir, err := os.Open(path)
			if err != nil {
				return nil, err
			}
			defer dir.Close()
			entries, err := dir.ReadDir(limit)
			if errors.Is(err, io.EOF) {
				err = nil
			}
			return entries, err
		},
	}
}

func openRegularMedia(path string) (openedMedia, error) {
	info, err := os.Stat(path)
	if err != nil {
		return openedMedia{}, err
	}
	if !info.Mode().IsRegular() {
		return openedMedia{}, fmt.Errorf("not a regular file: %s", path)
	}
	// Nonblocking open also handles a file replaced by a FIFO after the first stat.
	file, err := os.OpenFile(path, os.O_RDONLY|syscall.O_NONBLOCK, 0)
	if err != nil {
		return openedMedia{}, err
	}
	info, err = file.Stat()
	if err != nil || !info.Mode().IsRegular() {
		file.Close()
		if err != nil {
			return openedMedia{}, err
		}
		return openedMedia{}, fmt.Errorf("not a regular file: %s", path)
	}
	return openedMedia{file, info}, nil
}

func runMediaIO[T any](ctx context.Context, pool *mediaFileIO, path string, work func() (T, error), discard func(T)) (T, error) {
	var zero T
	if err := ctx.Err(); err != nil {
		return zero, err
	}
	select {
	case pool.slots <- struct{}{}:
	default:
		return zero, fmt.Errorf("%w: %s", ErrMediaIOBusy, path)
	}
	type result struct {
		value T
		err   error
	}
	done := make(chan result)
	go func() {
		defer func() { <-pool.slots }()
		if ctx.Err() != nil {
			return
		}
		value, err := work()
		select {
		case done <- result{value, err}:
		case <-ctx.Done():
			if discard != nil {
				discard(value)
			}
		}
	}()
	select {
	case result := <-done:
		return result.value, result.err
	case <-ctx.Done():
		return zero, fmt.Errorf("media filesystem operation %s: %w", path, ctx.Err())
	}
}

func (fs *FileSystemService) StatMedia(ctx context.Context, path string) (os.FileInfo, error) {
	return runMediaIO(ctx, fs.mediaIO, path, func() (os.FileInfo, error) { return fs.mediaIO.stat(path) }, nil)
}

func (fs *FileSystemService) OpenMedia(ctx context.Context, path string) (*os.File, os.FileInfo, error) {
	media, err := runMediaIO(ctx, fs.mediaIO, path, func() (openedMedia, error) { return fs.mediaIO.open(path) }, func(media openedMedia) {
		if media.file != nil {
			media.file.Close()
		}
	})
	return media.file, media.info, err
}

func mediaIOFailure(ctx context.Context, err error) error {
	if canceled := ctx.Err(); canceled != nil {
		return canceled
	}
	if errors.Is(err, ErrMediaIOBusy) {
		return err
	}
	return nil
}

func AnnotateMediaIOError(ctx context.Context, err error, path string) {
	cause := "io"
	if errors.Is(err, context.DeadlineExceeded) {
		cause = "timeout"
	} else if errors.Is(err, ErrMediaIOBusy) {
		cause = "unavailable"
	}
	AddErrorContext(ctx, ErrorContext{Resource: path, Step: "filesystem", Message: err.Error()})
	AnnotateError(ctx, "read", cause, "blocked")
}
