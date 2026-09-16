package services

import (
	"context"
	"math"
	"sync"
	"time"
)

type bandwidthClock interface {
	Now() time.Time
	Sleep(context.Context, time.Duration) error
}

type realBandwidthClock struct{}

func (realBandwidthClock) Now() time.Time {
	return time.Now()
}

func (realBandwidthClock) Sleep(ctx context.Context, duration time.Duration) error {
	return SleepContext(ctx, duration)
}

type IPBandwidthLimiter struct {
	bytesPerSecond int64
	burstBytes     int64
	clock          bandwidthClock

	mu                sync.Mutex
	buckets           map[string]*bandwidthBucket
	waitsSinceCleanup int
}

type bandwidthBucket struct {
	mu       sync.Mutex
	tokens   float64
	last     time.Time
	lastUsed time.Time
}

func NewIPBandwidthLimiter(bytesPerSecond, burstBytes int64) *IPBandwidthLimiter {
	return newIPBandwidthLimiter(bytesPerSecond, burstBytes, realBandwidthClock{})
}

func newIPBandwidthLimiter(bytesPerSecond, burstBytes int64, clock bandwidthClock) *IPBandwidthLimiter {
	if bytesPerSecond > 0 && burstBytes <= 0 {
		burstBytes = bytesPerSecond
	}
	return &IPBandwidthLimiter{
		bytesPerSecond: bytesPerSecond,
		burstBytes:     burstBytes,
		clock:          clock,
		buckets:        make(map[string]*bandwidthBucket),
	}
}

func (l *IPBandwidthLimiter) Wait(ctx context.Context, ip string, byteCount int) error {
	if l == nil || l.bytesPerSecond <= 0 || byteCount <= 0 {
		return ctx.Err()
	}
	bucket := l.bucket(ip)
	remaining := int64(byteCount)
	for remaining > 0 {
		chunk := min(remaining, l.burstBytes)
		if err := l.waitChunk(ctx, bucket, chunk); err != nil {
			return err
		}
		remaining -= chunk
	}
	return nil
}

func (l *IPBandwidthLimiter) bucket(ip string) *bandwidthBucket {
	now := l.clock.Now()

	l.mu.Lock()
	defer l.mu.Unlock()
	if bucket, ok := l.buckets[ip]; ok {
		return bucket
	}
	bucket := &bandwidthBucket{
		tokens:   float64(l.burstBytes),
		last:     now,
		lastUsed: now,
	}
	l.buckets[ip] = bucket
	return bucket
}

func (l *IPBandwidthLimiter) waitChunk(ctx context.Context, bucket *bandwidthBucket, byteCount int64) error {
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		now := l.clock.Now()
		bucket.mu.Lock()
		elapsed := now.Sub(bucket.last).Seconds()
		if elapsed > 0 {
			bucket.tokens = math.Min(
				float64(l.burstBytes),
				bucket.tokens+elapsed*float64(l.bytesPerSecond),
			)
			bucket.last = now
		}
		bucket.lastUsed = now
		if bucket.tokens >= float64(byteCount) {
			bucket.tokens -= float64(byteCount)
			bucket.mu.Unlock()
			l.maybeCleanup(now)
			return nil
		}
		missing := float64(byteCount) - bucket.tokens
		bucket.mu.Unlock()

		wait := time.Duration(math.Ceil(missing / float64(l.bytesPerSecond) * float64(time.Second)))
		if err := l.clock.Sleep(ctx, wait); err != nil {
			return err
		}
	}
}

func (l *IPBandwidthLimiter) maybeCleanup(now time.Time) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.waitsSinceCleanup++
	if l.waitsSinceCleanup < 256 {
		return
	}
	l.waitsSinceCleanup = 0
	for ip, bucket := range l.buckets {
		bucket.mu.Lock()
		inactive := now.Sub(bucket.lastUsed) > 10*time.Minute
		bucket.mu.Unlock()
		if inactive {
			delete(l.buckets, ip)
		}
	}
}
