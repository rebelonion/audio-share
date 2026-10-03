package middleware

import (
	"container/list"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/onion/audio-share-backend/clientip"
	"github.com/onion/audio-share-backend/config"
)

const (
	maxRateLimitClients      = 50000
	rateLimitCleanupInterval = int64(60_000) // milliseconds
)

type rateLimitData struct {
	apiCount           int
	imageCount         int
	accessFailureCount int
	shareCount         int
	shareTimestamp     int64
	contactCount       int
	contactTimestamp   int64
	timestamp          int64
	imageTimestamp     int64
	position           *list.Element
}

// idle reports whether every window holding a count has expired, so dropping
// the entry cannot reset a limit that is still in effect.
func (d *rateLimitData) idle(now int64, cfg *config.Config) bool {
	expired := func(count int, start int64, window int) bool {
		return count == 0 || now-start > int64(window)
	}
	return expired(d.apiCount+d.accessFailureCount, d.timestamp, cfg.RateLimitWindow) &&
		expired(d.imageCount, d.imageTimestamp, cfg.ImageRateLimitWindow) &&
		expired(d.shareCount, d.shareTimestamp, cfg.ShareLimitWindow) &&
		expired(d.contactCount, d.contactTimestamp, cfg.ContactLimitWindow)
}

type RateLimiter struct {
	mu          sync.Mutex
	limits      map[string]*rateLimitData
	recent      list.List
	nextCleanup int64
	cfg         *config.Config
}

func NewRateLimiter(cfg *config.Config) *RateLimiter {
	return &RateLimiter{
		limits: make(map[string]*rateLimitData),
		cfg:    cfg,
	}
}

func (rl *RateLimiter) AllowAccessAttempt(clientIP string) (bool, int) {
	now := time.Now().UnixMilli()
	rl.mu.Lock()
	defer rl.mu.Unlock()

	data := rl.dataLocked(clientIP, now)
	rl.resetGeneralWindowLocked(data, now)
	if data.accessFailureCount < rl.cfg.MaxRequestsPerWindow {
		return true, 0
	}

	remainingMillis := int64(rl.cfg.RateLimitWindow) - (now - data.timestamp)
	retryAfter := max(1, int((remainingMillis+999)/1000))
	return false, retryAfter
}

func (rl *RateLimiter) RecordAccessFailure(clientIP string) {
	now := time.Now().UnixMilli()
	rl.mu.Lock()
	defer rl.mu.Unlock()

	data := rl.dataLocked(clientIP, now)
	rl.resetGeneralWindowLocked(data, now)
	data.accessFailureCount++
}

func (rl *RateLimiter) dataLocked(ip string, now int64) *rateLimitData {
	if now >= rl.nextCleanup {
		for key, data := range rl.limits {
			if data.idle(now, rl.cfg) {
				delete(rl.limits, key)
				rl.recent.Remove(data.position)
			}
		}
		rl.nextCleanup = now + rateLimitCleanupInterval
	}
	if data, exists := rl.limits[ip]; exists {
		rl.recent.MoveToFront(data.position)
		return data
	}
	// Evict the least recently used client rather than refusing new ones.
	// Under sustained churn, an evicted client can receive a fresh allowance.
	if len(rl.limits) >= maxRateLimitClients {
		oldest := rl.recent.Back()
		delete(rl.limits, oldest.Value.(string))
		rl.recent.Remove(oldest)
	}
	data := &rateLimitData{
		shareTimestamp:   now,
		contactTimestamp: now,
		timestamp:        now,
		imageTimestamp:   now,
	}
	data.position = rl.recent.PushFront(ip)
	rl.limits[ip] = data
	return data
}

func (rl *RateLimiter) resetGeneralWindowLocked(data *rateLimitData, now int64) {
	if now-data.timestamp > int64(rl.cfg.RateLimitWindow) {
		data.apiCount = 0
		data.accessFailureCount = 0
		data.timestamp = now
	}
}

func (rl *RateLimiter) isProtectedAudioRequest(path string) bool {
	path = strings.TrimRight(path, "/")
	if !strings.HasPrefix(path, "/api/audio/key/") {
		return false
	}
	return strings.HasSuffix(path, "/download") ||
		(!strings.HasSuffix(path, "/thumbnail") &&
			!strings.HasSuffix(path, "/access") &&
			!strings.HasSuffix(path, "/meta") &&
			!strings.HasSuffix(path, "/waveform"))
}

func (rl *RateLimiter) isImageRequest(path string) bool {
	path = strings.ToLower(strings.TrimRight(path, "/"))
	return strings.HasSuffix(path, "/poster") || strings.HasSuffix(path, "/thumbnail")
}

func (rl *RateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := clientip.FromRequest(r)
		now := time.Now().UnixMilli()
		path := r.URL.Path

		if strings.HasPrefix(path, "/api/") {
			w.Header().Set("X-Robots-Tag", "noindex, nofollow, noarchive")
		}

		if path == "/api/errors" || strings.HasPrefix(path, "/api/admin/") || rl.isProtectedAudioRequest(path) {
			next.ServeHTTP(w, r)
			return
		}

		isImage := rl.isImageRequest(path)
		isShare := path == "/api/share" && r.Method == "POST"
		isContact := path == "/api/contact" && r.Method == "POST"

		rl.mu.Lock()
		data := rl.dataLocked(ip, now)
		rl.resetGeneralWindowLocked(data, now)
		if now-data.shareTimestamp > int64(rl.cfg.ShareLimitWindow) {
			data.shareCount = 0
			data.shareTimestamp = now
		}
		if now-data.contactTimestamp > int64(rl.cfg.ContactLimitWindow) {
			data.contactCount = 0
			data.contactTimestamp = now
		}
		if now-data.imageTimestamp > int64(rl.cfg.ImageRateLimitWindow) {
			data.imageCount = 0
			data.imageTimestamp = now
		}

		if isShare {
			data.shareCount++
		} else if isContact {
			data.contactCount++
		} else if isImage {
			data.imageCount++
		} else {
			data.apiCount++
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
		} else if isImage {
			limit = rl.cfg.MaxImagesPerWindow
			current = data.imageCount
			limitWindow = rl.cfg.ImageRateLimitWindow
			limitType = "image"
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
