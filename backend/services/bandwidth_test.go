package services

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

func TestIPBandwidthWaitCancels(t *testing.T) {
	limiter := NewIPBandwidthLimiter(1, 1)
	limiter.Wait(context.Background(), "test", 1)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	if err := limiter.Wait(ctx, "test", 100); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("wait did not cancel: %v", err)
	}
}

func TestIPBandwidthLimiterSharesCapacityForSameIP(t *testing.T) {
	clock := &fakeBandwidthClock{now: time.Unix(0, 0)}
	limiter := newIPBandwidthLimiter(100, 100, clock)

	limiter.Wait(context.Background(), "192.0.2.1", 100)
	if clock.TotalSleep() != 0 {
		t.Fatalf("initial burst slept for %v", clock.TotalSleep())
	}

	limiter.Wait(context.Background(), "192.0.2.1", 50)
	if clock.TotalSleep() != 500*time.Millisecond {
		t.Fatalf("shared follow-up slept for %v, want 500ms", clock.TotalSleep())
	}
}

func TestIPBandwidthLimiterSeparatesIPs(t *testing.T) {
	clock := &fakeBandwidthClock{now: time.Unix(0, 0)}
	limiter := newIPBandwidthLimiter(100, 100, clock)

	limiter.Wait(context.Background(), "192.0.2.1", 100)
	limiter.Wait(context.Background(), "192.0.2.2", 100)
	if clock.TotalSleep() != 0 {
		t.Fatalf("independent IP burst slept for %v", clock.TotalSleep())
	}
}

func TestIPBandwidthLimiterHandlesReadsLargerThanBurst(t *testing.T) {
	clock := &fakeBandwidthClock{now: time.Unix(0, 0)}
	limiter := newIPBandwidthLimiter(100, 25, clock)

	limiter.Wait(context.Background(), "192.0.2.1", 100)
	if clock.TotalSleep() != 750*time.Millisecond {
		t.Fatalf("large read slept for %v, want 750ms", clock.TotalSleep())
	}
}

func TestDisabledIPBandwidthLimiterDoesNotWait(t *testing.T) {
	clock := &fakeBandwidthClock{now: time.Unix(0, 0)}
	limiter := newIPBandwidthLimiter(0, 0, clock)
	limiter.Wait(context.Background(), "192.0.2.1", 1_000_000)
	if clock.TotalSleep() != 0 {
		t.Fatalf("disabled limiter slept for %v", clock.TotalSleep())
	}
}

type fakeBandwidthClock struct {
	mu    sync.Mutex
	now   time.Time
	slept time.Duration
}

func (c *fakeBandwidthClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *fakeBandwidthClock) Sleep(ctx context.Context, duration time.Duration) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = c.now.Add(duration)
	c.slept += duration
	return ctx.Err()
}

func (c *fakeBandwidthClock) TotalSleep() time.Duration {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.slept
}
