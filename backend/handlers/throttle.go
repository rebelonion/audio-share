package handlers

import (
	"io"
	"time"
)

type throttledReadSeeker struct {
	reader         io.ReadSeeker
	bytesPerSecond int64
	start          time.Time
	bytesRead      int64
}

func newThrottledReadSeeker(reader io.ReadSeeker, bytesPerSecond int64) io.ReadSeeker {
	if bytesPerSecond <= 0 {
		return reader
	}
	return &throttledReadSeeker{
		reader:         reader,
		bytesPerSecond: bytesPerSecond,
		start:          time.Now(),
	}
}

func (t *throttledReadSeeker) Read(p []byte) (int, error) {
	n, err := t.reader.Read(p)
	if n > 0 {
		t.bytesRead += int64(n)
		expected := time.Duration(t.bytesRead) * time.Second / time.Duration(t.bytesPerSecond)
		if delay := expected - time.Since(t.start); delay > 0 {
			time.Sleep(delay)
		}
	}
	return n, err
}

func (t *throttledReadSeeker) Seek(offset int64, whence int) (int64, error) {
	return t.reader.Seek(offset, whence)
}

type countingReadSeeker struct {
	reader    io.ReadSeeker
	bytesRead int64
}

func newCountingReadSeeker(reader io.ReadSeeker) *countingReadSeeker {
	return &countingReadSeeker{reader: reader}
}

func (c *countingReadSeeker) Read(p []byte) (int, error) {
	n, err := c.reader.Read(p)
	if n > 0 {
		c.bytesRead += int64(n)
	}
	return n, err
}

func (c *countingReadSeeker) Seek(offset int64, whence int) (int64, error) {
	return c.reader.Seek(offset, whence)
}

func (c *countingReadSeeker) BytesRead() int64 {
	return c.bytesRead
}
