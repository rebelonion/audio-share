package handlers

import (
	"io"
	"time"

	"github.com/onion/audio-share-backend/services"
)

type throttledReadSeeker struct {
	reader         io.ReadSeeker
	bytesPerSecond int64
	start          time.Time
	bytesRead      int64
	ipLimiter      *services.IPBandwidthLimiter
	clientIP       string
}

func newThrottledReadSeeker(
	reader io.ReadSeeker,
	bytesPerSecond int64,
	ipLimiter *services.IPBandwidthLimiter,
	clientIP string,
) io.ReadSeeker {
	if bytesPerSecond <= 0 && ipLimiter == nil {
		return reader
	}
	return &throttledReadSeeker{
		reader:         reader,
		bytesPerSecond: bytesPerSecond,
		start:          time.Now(),
		ipLimiter:      ipLimiter,
		clientIP:       clientIP,
	}
}

func (t *throttledReadSeeker) Read(p []byte) (int, error) {
	n, err := t.reader.Read(p)
	if n > 0 && t.bytesPerSecond > 0 {
		t.bytesRead += int64(n)
		expected := time.Duration(t.bytesRead) * time.Second / time.Duration(t.bytesPerSecond)
		if delay := expected - time.Since(t.start); delay > 0 {
			time.Sleep(delay)
		}
	}
	if n > 0 && t.ipLimiter != nil {
		t.ipLimiter.Wait(t.clientIP, n)
	}
	return n, err
}

func (t *throttledReadSeeker) Seek(offset int64, whence int) (int64, error) {
	return t.reader.Seek(offset, whence)
}
