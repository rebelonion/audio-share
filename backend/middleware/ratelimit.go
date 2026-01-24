package middleware

import (
	"encoding/json"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/onion/audio-share-backend/config"
)

type rateLimitData struct {
	apiCount         int
	audioCount       int
	shareCount       int
	shareTimestamp   int64
	contactCount     int
	contactTimestamp int64
	timestamp        int64
}

type RateLimiter struct {
	mu       sync.RWMutex
	limits   map[string]*rateLimitData
	cfg      *config.Config
	audioExt map[string]bool
}

func NewRateLimiter(cfg *config.Config) *RateLimiter {
	return &RateLimiter{
		limits: make(map[string]*rateLimitData),
		cfg:    cfg,
		audioExt: map[string]bool{
			".mp3": true, ".wav": true, ".ogg": true, ".flac": true,
			".aac": true, ".m4a": true, ".opus": true,
		},
	}
}

func (rl *RateLimiter) getClientIP(r *http.Request) string {
	if ip := r.Header.Get("CF-Connecting-IP"); ip != "" {
		return ip
	}
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		if len(parts) > 0 {
			return strings.TrimSpace(parts[0])
		}
	}
	addr := r.RemoteAddr
	if idx := strings.LastIndex(addr, ":"); idx != -1 {
		return addr[:idx]
	}
	return addr
}

func (rl *RateLimiter) isAudioRequest(path string) bool {
	path = strings.ToLower(path)
	for ext := range rl.audioExt {
		if strings.HasSuffix(path, ext) {
			return true
		}
	}
	return false
}

func (rl *RateLimiter) isImageRequest(path string) bool {
	path = strings.ToLower(path)
	imageExts := []string{".jpg", ".jpeg", ".png", ".gif", ".webp"}
	for _, ext := range imageExts {
		if strings.HasSuffix(path, ext) {
			return true
		}
	}
	return false
}

func (rl *RateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := rl.getClientIP(r)
		now := time.Now().UnixMilli()
		path := r.URL.Path

		isAudio := rl.isAudioRequest(path)
		isImage := rl.isImageRequest(path)
		isShare := path == "/api/share" && r.Method == "POST"
		isContact := path == "/api/contact" && r.Method == "POST"
		isRange := r.Header.Get("Range") != ""

		rl.mu.Lock()
		data, exists := rl.limits[ip]
		if !exists {
			data = &rateLimitData{
				shareTimestamp:   now,
				contactTimestamp: now,
				timestamp:        now,
			}
			rl.limits[ip] = data
		}

		if now-data.timestamp > int64(rl.cfg.RateLimitWindow) {
			data.audioCount = 0
			data.apiCount = 0
			data.timestamp = now
		}
		if now-data.shareTimestamp > int64(rl.cfg.ShareLimitWindow) {
			data.shareCount = 0
			data.shareTimestamp = now
		}
		if now-data.contactTimestamp > int64(rl.cfg.ContactLimitWindow) {
			data.contactCount = 0
			data.contactTimestamp = now
		}

		if isShare {
			data.shareCount++
		} else if isContact {
			data.contactCount++
		} else if !isImage && !(isAudio && isRange) {
			if isAudio {
				data.audioCount++
			} else {
				data.apiCount++
			}
		}

		if rand.Float64() < 0.01 {
			for key, val := range rl.limits {
				if now-val.timestamp > int64(rl.cfg.RateLimitWindow) &&
					now-val.shareTimestamp > int64(rl.cfg.ShareLimitWindow) &&
					now-val.contactTimestamp > int64(rl.cfg.ContactLimitWindow) {
					delete(rl.limits, key)
				}
			}
		}

		var limit, current int
		var limitWindow int
		var limitType string

		if isShare {
			limit = rl.cfg.ShareRequestLimit
			current = data.shareCount
			limitWindow = rl.cfg.ShareLimitWindow
			limitType = "share"
		} else if isContact {
			limit = rl.cfg.ContactRequestLimit
			current = data.contactCount
			limitWindow = rl.cfg.ContactLimitWindow
			limitType = "contact"
		} else if isAudio {
			limit = rl.cfg.AudioFileLimit
			current = data.audioCount
			limitWindow = rl.cfg.RateLimitWindow
			limitType = "audio"
		} else {
			limit = rl.cfg.MaxRequestsPerWindow
			current = data.apiCount
			limitWindow = rl.cfg.RateLimitWindow
			limitType = "api"
		}

		rl.mu.Unlock()

		if current > limit {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", strconv.Itoa(limitWindow/1000))
			w.WriteHeader(http.StatusTooManyRequests)

			var message string
			if limitType == "share" {
				message = "You've reached the limit of " + strconv.Itoa(limit) + " artist requests per day. Please try again tomorrow."
			} else if limitType == "contact" {
				message = "You've reached the limit of " + strconv.Itoa(limit) + " contact submissions per day. Please try again tomorrow."
			} else {
				message = "Too many requests"
			}

			json.NewEncoder(w).Encode(map[string]interface{}{
				"error":   "Too many requests",
				"message": message,
				"limit":   limit,
				"current": current,
			})
			return
		}

		w.Header().Set("X-RateLimit-Limit", strconv.Itoa(limit))
		w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(max(0, limit-current)))

		next.ServeHTTP(w, r)
	})
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
