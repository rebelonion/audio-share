package handlers

import (
	"bytes"
	"io"
	"sync"
	"testing"
	"time"
)

func TestThrottledReadSeekerAllowsInitialBurst(t *testing.T) {
	clock := &fakeThrottleClock{now: time.Unix(0, 0)}
	reader := newThrottledReadSeekerWithClock(
		bytes.NewReader(make([]byte, 250)),
		100,
		200,
		nil,
		"",
		clock,
	)

	readExactly(t, reader, 150)
	if clock.TotalSleep() != 0 {
		t.Fatalf("initial burst slept for %v", clock.TotalSleep())
	}

	readExactly(t, reader, 100)
	if clock.TotalSleep() != 500*time.Millisecond {
		t.Fatalf("read past burst slept for %v, want 500ms", clock.TotalSleep())
	}
}

func TestThrottledReadSeekerReturnsBurstBeforeOversizedRead(t *testing.T) {
	clock := &fakeThrottleClock{now: time.Unix(0, 0)}
	reader := newThrottledReadSeekerWithClock(
		bytes.NewReader(make([]byte, 30)),
		100,
		10,
		nil,
		"",
		clock,
	)
	buffer := make([]byte, 30)

	n, err := reader.Read(buffer)
	if err != nil {
		t.Fatalf("initial read: %v", err)
	}
	if n != 10 {
		t.Fatalf("initial read returned %d bytes, want burst of 10", n)
	}
	if clock.TotalSleep() != 0 {
		t.Fatalf("initial burst slept for %v", clock.TotalSleep())
	}

	n, err = reader.Read(buffer)
	if err != nil {
		t.Fatalf("follow-up read: %v", err)
	}
	if n != 10 {
		t.Fatalf("follow-up read returned %d bytes, want 10", n)
	}
	if clock.TotalSleep() != 100*time.Millisecond {
		t.Fatalf("follow-up read slept for %v, want 100ms", clock.TotalSleep())
	}
}

func TestThrottledReadSeekerRefillDoesNotExceedBurst(t *testing.T) {
	clock := &fakeThrottleClock{now: time.Unix(0, 0)}
	reader := newThrottledReadSeekerWithClock(
		bytes.NewReader(make([]byte, 401)),
		100,
		200,
		nil,
		"",
		clock,
	)

	readExactly(t, reader, 200)
	clock.Advance(10 * time.Second)
	readExactly(t, reader, 200)
	readExactly(t, reader, 1)
	if clock.TotalSleep() != 10*time.Millisecond {
		t.Fatalf("refilled bucket slept for %v, want 10ms", clock.TotalSleep())
	}
}

func TestThrottledReadSeekerWithNoBurstPacesFirstRead(t *testing.T) {
	clock := &fakeThrottleClock{now: time.Unix(0, 0)}
	reader := newThrottledReadSeekerWithClock(
		bytes.NewReader(make([]byte, 50)),
		100,
		0,
		nil,
		"",
		clock,
	)

	readExactly(t, reader, 50)
	if clock.TotalSleep() != 500*time.Millisecond {
		t.Fatalf("first read slept for %v, want 500ms", clock.TotalSleep())
	}
}

func TestAudioHandlerSelectsStreamAndDownloadThrottleSettings(t *testing.T) {
	handler := &AudioHandler{
		streamBytesPerSecond:   100,
		streamBurstBytes:       200,
		downloadBytesPerSecond: 300,
		downloadBurstBytes:     400,
	}

	tests := []struct {
		name           string
		download       bool
		bytesPerSecond int64
		burstBytes     int64
	}{
		{name: "stream", bytesPerSecond: 100, burstBytes: 200},
		{name: "download", download: true, bytesPerSecond: 300, burstBytes: 400},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := handler.bytesPerSecond(test.download); got != test.bytesPerSecond {
				t.Fatalf("bytes per second = %d, want %d", got, test.bytesPerSecond)
			}
			if got := handler.burstBytes(test.download); got != test.burstBytes {
				t.Fatalf("burst bytes = %d, want %d", got, test.burstBytes)
			}
		})
	}
}

func readExactly(t *testing.T, reader io.Reader, byteCount int) {
	t.Helper()
	buffer := make([]byte, byteCount)
	if _, err := io.ReadFull(reader, buffer); err != nil {
		t.Fatalf("read %d bytes: %v", byteCount, err)
	}
}

type fakeThrottleClock struct {
	mu    sync.Mutex
	now   time.Time
	slept time.Duration
}

func (c *fakeThrottleClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *fakeThrottleClock) Sleep(duration time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = c.now.Add(duration)
	c.slept += duration
}

func (c *fakeThrottleClock) Advance(duration time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = c.now.Add(duration)
}

func (c *fakeThrottleClock) TotalSleep() time.Duration {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.slept
}
