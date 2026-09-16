package handlers

import (
	"context"
	"io"
	"math"
	"time"

	"github.com/onion/audio-share-backend/services"
)

type throttleClock interface {
	Now() time.Time
	Sleep(context.Context, time.Duration) error
}

type realThrottleClock struct{}

func (realThrottleClock) Now() time.Time {
	return time.Now()
}

func (realThrottleClock) Sleep(ctx context.Context, duration time.Duration) error {
	return services.SleepContext(ctx, duration)
}

type throttledReadSeeker struct {
	ctx            context.Context
	reader         io.ReadSeeker
	bytesPerSecond int64
	burstBytes     int64
	tokens         float64
	lastRefill     time.Time
	clock          throttleClock
	ipLimiter      *services.IPBandwidthLimiter
	clientIP       string
}

func newThrottledReadSeeker(
	ctx context.Context,
	reader io.ReadSeeker,
	bytesPerSecond int64,
	burstBytes int64,
	ipLimiter *services.IPBandwidthLimiter,
	clientIP string,
) io.ReadSeeker {
	return newThrottledReadSeekerWithClock(
		ctx,
		reader,
		bytesPerSecond,
		burstBytes,
		ipLimiter,
		clientIP,
		realThrottleClock{},
	)
}

func newThrottledReadSeekerWithClock(
	ctx context.Context,
	reader io.ReadSeeker,
	bytesPerSecond int64,
	burstBytes int64,
	ipLimiter *services.IPBandwidthLimiter,
	clientIP string,
	clock throttleClock,
) io.ReadSeeker {
	if bytesPerSecond <= 0 && ipLimiter == nil {
		return reader
	}
	burstBytes = max(burstBytes, 0)
	return &throttledReadSeeker{
		ctx:            ctx,
		reader:         reader,
		bytesPerSecond: bytesPerSecond,
		burstBytes:     burstBytes,
		tokens:         float64(burstBytes),
		lastRefill:     clock.Now(),
		clock:          clock,
		ipLimiter:      ipLimiter,
		clientIP:       clientIP,
	}
}

func (t *throttledReadSeeker) Read(p []byte) (int, error) {
	if err := t.ctx.Err(); err != nil {
		return 0, err
	}
	readBuffer := p
	burstLimited := t.bytesPerSecond > 0 && t.burstBytes > 0 && len(p) > 0
	if burstLimited {
		limit, err := t.readLimit(len(p))
		if err != nil {
			return 0, err
		}
		readBuffer = p[:limit]
	}

	n, err := t.reader.Read(readBuffer)
	if n > 0 && t.bytesPerSecond > 0 {
		if burstLimited {
			t.tokens = math.Max(0, t.tokens-float64(n))
		} else {
			if err := t.wait(n); err != nil {
				return 0, err
			}
		}
	}
	if n > 0 && t.ipLimiter != nil {
		if err := t.ipLimiter.Wait(t.ctx, t.clientIP, n); err != nil {
			return 0, err
		}
	}
	return n, err
}

func (t *throttledReadSeeker) Seek(offset int64, whence int) (int64, error) {
	return t.reader.Seek(offset, whence)
}

func (t *throttledReadSeeker) refill() {
	now := t.clock.Now()
	elapsed := now.Sub(t.lastRefill).Seconds()
	if elapsed > 0 {
		t.tokens = math.Min(
			float64(t.burstBytes),
			t.tokens+elapsed*float64(t.bytesPerSecond),
		)
	}
	t.lastRefill = now
}

func (t *throttledReadSeeker) readLimit(maxBytes int) (int, error) {
	t.refill()
	if available := min(int64(t.tokens), int64(maxBytes)); available >= 1 {
		return int(available), nil
	}

	target := min(int64(maxBytes), t.burstBytes)
	delay := time.Duration(math.Ceil(
		(float64(target) - t.tokens) / float64(t.bytesPerSecond) * float64(time.Second),
	))
	if err := t.clock.Sleep(t.ctx, delay); err != nil {
		return 0, err
	}
	t.refill()
	return int(target), nil
}

func (t *throttledReadSeeker) wait(byteCount int) error {
	t.refill()
	t.tokens -= float64(byteCount)
	if t.tokens >= 0 {
		return nil
	}

	delay := time.Duration(math.Ceil(
		-t.tokens / float64(t.bytesPerSecond) * float64(time.Second),
	))
	if err := t.clock.Sleep(t.ctx, delay); err != nil {
		return err
	}
	t.tokens = 0
	t.lastRefill = t.clock.Now()
	return nil
}
