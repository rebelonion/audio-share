package middleware

import (
	"container/list"
	"fmt"
	"net/http"
	"sync"
	"time"
)

const maxAdminFailureClients = 10000

type adminFailureWindow struct {
	count    int
	expires  time.Time
	position *list.Element
}

type AdminFailureLimiter struct {
	mu          sync.Mutex
	clients     map[string]adminFailureWindow
	recent      list.List
	nextCleanup time.Time
	limit       int
	window      time.Duration
}

func NewAdminFailureLimiter(limit int, window string) (*AdminFailureLimiter, error) {
	if limit < 1 {
		return nil, fmt.Errorf("ADMIN_AUTH_FAILURE_LIMIT must be positive")
	}
	duration, err := time.ParseDuration(window)
	if err != nil || duration < time.Second || duration%time.Second != 0 {
		return nil, fmt.Errorf("ADMIN_AUTH_FAILURE_WINDOW must be a duration of at least one whole second")
	}
	return &AdminFailureLimiter{clients: make(map[string]adminFailureWindow), limit: limit, window: duration}, nil
}

// Check serializes the limit check and credential verification so concurrent
// guesses cannot exceed the allowance. A blocked key is never verified.
func (l *AdminFailureLimiter) Check(r *http.Request, now time.Time, verify func() bool) (valid bool, retryAfter int) {
	client := getClientIP(r)
	l.mu.Lock()
	defer l.mu.Unlock()
	if !now.Before(l.nextCleanup) {
		for ip, entry := range l.clients {
			if !now.Before(entry.expires) {
				delete(l.clients, ip)
				l.recent.Remove(entry.position)
			}
		}
		l.nextCleanup = now.Add(min(time.Minute, l.window))
	}
	entry, exists := l.clients[client]
	if exists {
		l.recent.MoveToFront(entry.position)
	}
	if !now.Before(entry.expires) {
		entry.count = 0
		entry.expires = now.Add(l.window)
	}
	if entry.count >= l.limit {
		remaining := entry.expires.Sub(now)
		retry := int(remaining / time.Second)
		if remaining%time.Second != 0 {
			retry++
		}
		return false, max(1, retry)
	}
	if verify() {
		return true, 0
	}
	entry.count++
	if !exists {
		// Evict the least recently used client rather than sharing a lockout.
		// Under sustained churn, an evicted client can receive a fresh allowance.
		if len(l.clients) >= maxAdminFailureClients {
			oldest := l.recent.Back()
			delete(l.clients, oldest.Value.(string))
			l.recent.Remove(oldest)
		}
		entry.position = l.recent.PushFront(client)
	}
	l.clients[client] = entry
	return false, 0
}
