package services

import (
	"errors"
	"sync"
	"time"
)

var errCacheLoadAborted = errors.New("cache load aborted")

// ttlCache keeps successful loads for a fixed window. Concurrent misses for
// the same key share one load, so an expiry does not send every waiting
// request to the database. Failed loads are not cached. Cached values are
// shared between callers and must not be modified. The zero value is usable
// and caches nothing beyond deduplicating concurrent loads.
type ttlCache[K comparable, V any] struct {
	ttl time.Duration
	now func() time.Time

	mu         sync.Mutex
	entries    map[K]ttlCacheEntry[V]
	inflight   map[K]*ttlCacheLoad[V]
	generation int
}

type ttlCacheEntry[V any] struct {
	value     V
	fetchedAt time.Time
}

type ttlCacheLoad[V any] struct {
	done  chan struct{}
	value V
	err   error
}

func newTTLCache[K comparable, V any](ttl time.Duration) ttlCache[K, V] {
	return ttlCache[K, V]{ttl: ttl, now: time.Now}
}

func (c *ttlCache[K, V]) clock() time.Time {
	if c.now == nil {
		return time.Now()
	}
	return c.now()
}

func (c *ttlCache[K, V]) get(key K, load func() (V, error)) (V, error) {
	c.mu.Lock()
	if entry, ok := c.entries[key]; ok && c.clock().Sub(entry.fetchedAt) < c.ttl {
		c.mu.Unlock()
		return entry.value, nil
	}
	if call, ok := c.inflight[key]; ok {
		c.mu.Unlock()
		<-call.done
		return call.value, call.err
	}
	if c.inflight == nil {
		c.inflight = make(map[K]*ttlCacheLoad[V])
	}
	call := &ttlCacheLoad[V]{done: make(chan struct{}), err: errCacheLoadAborted}
	c.inflight[key] = call
	generation := c.generation
	c.mu.Unlock()

	// Runs even if load panics, so waiters are released with an error.
	defer c.finish(key, call, generation)
	call.value, call.err = load()
	return call.value, call.err
}

func (c *ttlCache[K, V]) finish(key K, call *ttlCacheLoad[V], generation int) {
	c.mu.Lock()
	if c.inflight[key] == call {
		delete(c.inflight, key)
	}
	// An invalidate during the load means the result may be outdated.
	if call.err == nil && c.generation == generation && c.ttl > 0 {
		if c.entries == nil {
			c.entries = make(map[K]ttlCacheEntry[V])
		}
		c.entries[key] = ttlCacheEntry[V]{value: call.value, fetchedAt: c.clock()}
	}
	c.mu.Unlock()
	close(call.done)
}

// invalidate drops every cached value; loads already running are not stored.
func (c *ttlCache[K, V]) invalidate() {
	c.mu.Lock()
	c.entries = nil
	c.inflight = nil
	c.generation++
	c.mu.Unlock()
}
