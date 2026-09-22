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

// A controlled clock lets the old stream immediately request another read
// while the new stream is already queued, without depending on timer races.
type queuedBandwidthClock struct {
	fakeBandwidthClock
	sleeps chan bandwidthSleep
}
type bandwidthSleep struct {
	duration time.Duration
	resume   chan struct{}
}

func (c *queuedBandwidthClock) Sleep(ctx context.Context, duration time.Duration) error {
	request := bandwidthSleep{duration, make(chan struct{})}
	select {
	case c.sleeps <- request:
	case <-ctx.Done():
		return ctx.Err()
	}
	select {
	case <-request.resume:
		return ctx.Err()
	case <-ctx.Done():
		return ctx.Err()
	}
}
func (c *queuedBandwidthClock) advance(t *testing.T) {
	t.Helper()
	select {
	case request := <-c.sleeps:
		c.mu.Lock()
		c.now = c.now.Add(request.duration)
		c.mu.Unlock()
		close(request.resume)
	case <-time.After(time.Second):
		t.Fatal("no scheduled bandwidth wait")
	}
}
func waitForBandwidthQueue(t *testing.T, limiter *IPBandwidthLimiter, count int) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		limiter.mu.Lock()
		bucket := limiter.buckets["test"]
		bucket.mu.Lock()
		n := bucket.queue.Len()
		bucket.mu.Unlock()
		limiter.mu.Unlock()
		if n == count {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("queue did not reach %d", count)
}
func TestIPBandwidthLimiterDoesNotLetBusyStreamOvertake(t *testing.T) {
	clock := &queuedBandwidthClock{fakeBandwidthClock: fakeBandwidthClock{now: time.Unix(0, 0)}, sleeps: make(chan bandwidthSleep, 10)}
	limiter := newIPBandwidthLimiter(32768, 32768, clock)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := limiter.Wait(ctx, "test", 32768); err != nil {
		t.Fatal(err)
	}
	completed := make(chan string, 3)
	go func() {
		if limiter.Wait(ctx, "test", 32768) != nil {
			return
		}
		completed <- "old"
		if limiter.Wait(ctx, "test", 32768) != nil {
			return
		}
		completed <- "old again"
	}()
	waitForBandwidthQueue(t, limiter, 1)
	go func() {
		if limiter.Wait(ctx, "test", 32768) == nil {
			completed <- "new"
		}
	}()
	waitForBandwidthQueue(t, limiter, 2)
	for _, want := range []string{"old", "new", "old again"} {
		clock.advance(t)
		select {
		case got := <-completed:
			if got != want {
				t.Fatalf("got %q, want %q", got, want)
			}
		case <-time.After(time.Second):
			t.Fatalf("%s starved", want)
		}
	}
}

func TestIPBandwidthLimiterCancellationReleasesQueue(t *testing.T) {
	clock := &queuedBandwidthClock{fakeBandwidthClock: fakeBandwidthClock{now: time.Unix(0, 0)}, sleeps: make(chan bandwidthSleep, 10)}
	limiter := newIPBandwidthLimiter(100, 100, clock)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	limiter.Wait(ctx, "test", 100)
	headCtx, cancelHead := context.WithCancel(ctx)
	headDone := make(chan error, 1)
	go func() { headDone <- limiter.Wait(headCtx, "test", 100) }()
	waitForBandwidthQueue(t, limiter, 1)
	// Consume the head's scheduled sleep without advancing the clock.
	select {
	case <-clock.sleeps:
	case <-time.After(time.Second):
		t.Fatal("head did not sleep")
	}
	followerCtx, cancelFollower := context.WithCancel(ctx)
	followerDone := make(chan error, 1)
	go func() { followerDone <- limiter.Wait(followerCtx, "test", 100) }()
	waitForBandwidthQueue(t, limiter, 2)
	cancelFollower()
	if err := <-followerDone; !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	waitForBandwidthQueue(t, limiter, 1)
	nextDone := make(chan error, 1)
	go func() { nextDone <- limiter.Wait(ctx, "test", 100) }()
	waitForBandwidthQueue(t, limiter, 2)
	// A different IP still has its own initial burst.
	if err := limiter.Wait(ctx, "other", 100); err != nil {
		t.Fatal(err)
	}
	cancelHead()
	if err := <-headDone; !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	clock.advance(t)
	select {
	case err := <-nextDone:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("canceled head blocked successor")
	}
}

func TestIPBandwidthCleanupKeepsActiveWaiters(t *testing.T) {
	clock := &fakeBandwidthClock{now: time.Unix(0, 0)}
	limiter := newIPBandwidthLimiter(100, 100, clock)
	bucket := limiter.bucket("test")
	clock.Sleep(context.Background(), 11*time.Minute)
	limiter.waitsSinceCleanup = 255
	limiter.maybeCleanup(clock.Now())
	if limiter.buckets["test"] != bucket {
		t.Fatal("active bucket was removed")
	}
	bucket.active = 0
	limiter.waitsSinceCleanup = 255
	limiter.maybeCleanup(clock.Now())
	if limiter.buckets["test"] != nil {
		t.Fatal("idle bucket was retained")
	}
}
