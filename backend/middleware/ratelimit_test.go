package middleware

import (
	"testing"
	"time"

	"github.com/onion/audio-share-backend/config"
)

func TestProtectedAudioRequestClassification(t *testing.T) {
	limiter := NewRateLimiter(&config.Config{})
	tests := map[string]bool{
		"/api/audio/key/track":           true,
		"/api/audio/key/track/download":  true,
		"/api/audio/key/track/access":    false,
		"/api/audio/key/track/access/":   false,
		"/api/audio/key/track/meta":      false,
		"/api/audio/key/track/waveform":  false,
		"/api/audio/key/track/thumbnail": false,
	}
	for path, want := range tests {
		if got := limiter.isProtectedAudioRequest(path); got != want {
			t.Errorf("isProtectedAudioRequest(%q) = %v, want %v", path, got, want)
		}
	}
}

func TestAccessFailuresUseRequestLimitWithoutCountingAllowedAttempts(t *testing.T) {
	limiter := NewRateLimiter(&config.Config{
		MaxRequestsPerWindow: 2,
		RateLimitWindow:      int(time.Minute / time.Millisecond),
	})
	const clientIP = "192.0.2.1"

	for range 2 {
		allowed, _ := limiter.AllowAccessAttempt(clientIP)
		if !allowed {
			t.Fatal("attempt was blocked before the failure allowance was exhausted")
		}
	}

	limiter.RecordAccessFailure(clientIP)
	allowed, _ := limiter.AllowAccessAttempt(clientIP)
	if !allowed {
		t.Fatal("one recorded failure exhausted an allowance of two")
	}
	limiter.RecordAccessFailure(clientIP)

	allowed, retryAfter := limiter.AllowAccessAttempt(clientIP)
	if allowed {
		t.Fatal("attempt was allowed after the failure allowance was exhausted")
	}
	if retryAfter <= 0 {
		t.Fatalf("retryAfter = %d, want a positive value", retryAfter)
	}
}
