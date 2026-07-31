package middleware

import (
	"net/http"
	"net/http/httptest"
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

func TestImageRequestsUseSeparateLimit(t *testing.T) {
	limiter := NewRateLimiter(&config.Config{
		MaxRequestsPerWindow: 1,
		RateLimitWindow:      int(time.Minute / time.Millisecond),
		MaxImagesPerWindow:   2,
		ImageRateLimitWindow: int(time.Minute / time.Millisecond),
	})
	handler := limiter.Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	request := func(path string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.RemoteAddr = "192.0.2.1:1234"
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, req)
		return recorder
	}

	if status := request("/api/folder/key/folder/poster/").Code; status != http.StatusNoContent {
		t.Fatalf("first image status = %d, want %d", status, http.StatusNoContent)
	}
	if status := request("/api/audio/key/track/thumbnail/").Code; status != http.StatusNoContent {
		t.Fatalf("second image status = %d, want %d", status, http.StatusNoContent)
	}
	if status := request("/api/audio/key/other/thumbnail").Code; status != http.StatusTooManyRequests {
		t.Fatalf("third image status = %d, want %d", status, http.StatusTooManyRequests)
	}

	if status := request("/api/search?q=test").Code; status != http.StatusNoContent {
		t.Fatalf("first API status = %d, want %d", status, http.StatusNoContent)
	}
	if status := request("/api/stats").Code; status != http.StatusTooManyRequests {
		t.Fatalf("second API status = %d, want %d", status, http.StatusTooManyRequests)
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
