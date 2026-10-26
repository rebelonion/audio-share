package services

import (
	"errors"
	"regexp"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestTTLCacheServesValueUntilExpiry(t *testing.T) {
	now := time.Date(2026, time.October, 25, 12, 0, 0, 0, time.UTC)
	cache := newTTLCache[string, int](time.Minute)
	cache.now = func() time.Time { return now }
	loads := 0
	load := func() (int, error) {
		loads++
		return loads, nil
	}

	if got, _ := cache.get("k", load); got != 1 {
		t.Fatalf("first get = %d, want 1", got)
	}
	now = now.Add(time.Minute - time.Second)
	if got, _ := cache.get("k", load); got != 1 {
		t.Fatalf("get within ttl = %d, want cached 1", got)
	}
	if got, _ := cache.get("other", load); got != 2 {
		t.Fatalf("get for another key = %d, want 2", got)
	}
	now = now.Add(time.Second)
	if got, _ := cache.get("k", load); got != 3 {
		t.Fatalf("get after expiry = %d, want reloaded 3", got)
	}
}

func TestTTLCacheDoesNotCacheErrors(t *testing.T) {
	cache := newTTLCache[string, int](time.Minute)
	failure := errors.New("database down")
	if _, err := cache.get("k", func() (int, error) { return 0, failure }); !errors.Is(err, failure) {
		t.Fatalf("err = %v, want %v", err, failure)
	}
	got, err := cache.get("k", func() (int, error) { return 7, nil })
	if err != nil || got != 7 {
		t.Fatalf("get after failure = %d, %v; want 7, nil", got, err)
	}
}

func TestTTLCacheSharesConcurrentLoads(t *testing.T) {
	cache := newTTLCache[string, int](time.Minute)
	release := make(chan struct{})
	var loads atomic.Int32
	load := func() (int, error) {
		loads.Add(1)
		<-release
		return 42, nil
	}

	const callers = 20
	var wg sync.WaitGroup
	results := make([]int, callers)
	started := make(chan struct{})
	go func() {
		defer close(started)
		results[0], _ = cache.get("k", load)
	}()
	waitForInflight(t, &cache, "k")
	for i := 1; i < callers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			results[i], _ = cache.get("k", load)
		}()
	}
	close(release)
	wg.Wait()
	<-started

	if n := loads.Load(); n != 1 {
		t.Fatalf("loads = %d, want 1", n)
	}
	for i, got := range results {
		if got != 42 {
			t.Fatalf("caller %d got %d, want 42", i, got)
		}
	}
}

func TestTTLCacheInvalidateDiscardsRunningLoad(t *testing.T) {
	cache := newTTLCache[string, int](time.Minute)
	release := make(chan struct{})
	done := make(chan int)
	go func() {
		v, _ := cache.get("k", func() (int, error) {
			<-release
			return 1, nil
		})
		done <- v
	}()
	waitForInflight(t, &cache, "k")
	cache.invalidate()
	close(release)
	<-done

	if got, _ := cache.get("k", func() (int, error) { return 2, nil }); got != 2 {
		t.Fatalf("get after invalidate = %d, want fresh 2", got)
	}
}

func TestTTLCachePanicReleasesWaiters(t *testing.T) {
	cache := newTTLCache[string, int](time.Minute)
	release := make(chan struct{})
	go func() {
		defer func() { _ = recover() }()
		_, _ = cache.get("k", func() (int, error) {
			<-release
			panic("boom")
		})
	}()
	waitForInflight(t, &cache, "k")

	errc := make(chan error, 1)
	go func() {
		_, err := cache.get("k", func() (int, error) { return 0, nil })
		errc <- err
	}()
	close(release)
	select {
	case err := <-errc:
		if err != nil && !errors.Is(err, errCacheLoadAborted) {
			t.Fatalf("waiter err = %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("waiter stayed blocked after the load panicked")
	}
}

func TestTTLCacheZeroValueDoesNotCache(t *testing.T) {
	var cache ttlCache[string, int]
	loads := 0
	load := func() (int, error) {
		loads++
		return loads, nil
	}
	cache.get("k", load)
	if got, _ := cache.get("k", load); got != 2 {
		t.Fatalf("zero-value cache returned %d, want 2", got)
	}
}

func TestPopularTracksAreCachedAndBanlistInvalidates(t *testing.T) {
	db, mock, err := sqlmock.New(sqlmock.ValueConverterOption(passThroughSlices{}))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	popular := regexp.QuoteMeta("WITH play_windows AS")
	mock.ExpectQuery(popular).WillReturnRows(sqlmock.NewRows([]string{"unused"}))
	mock.ExpectQuery(popular).WillReturnRows(sqlmock.NewRows([]string{"unused"}))
	mock.ExpectQuery(popular).WillReturnRows(sqlmock.NewRows([]string{"unused"}))

	service := NewPlaybackService(&Database{db: db}, 0)
	for range 3 {
		if _, err := service.GetPopularTracks(30, false); err != nil {
			t.Fatal(err)
		}
	}
	// The local view includes removal-requested tracks, so it is cached apart.
	if _, err := service.GetPopularTracks(30, true); err != nil {
		t.Fatal(err)
	}
	service.SetPopularBanlist([]string{"asmr"})
	if _, err := service.GetPopularTracks(30, false); err != nil {
		t.Fatal(err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestRecentlyPlayedIsCached(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	mock.ExpectQuery(regexp.QuoteMeta("FROM play_events pe")).
		WithArgs(30).
		WillReturnRows(sqlmock.NewRows([]string{"unused"}))

	service := NewPlaybackService(&Database{db: db}, 0)
	for range 3 {
		if _, err := service.GetRecentlyPlayed(30, false); err != nil {
			t.Fatal(err)
		}
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestInvalidateDiscoveryListsClearsBothCaches(t *testing.T) {
	db, mock, err := sqlmock.New(sqlmock.ValueConverterOption(passThroughSlices{}))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	popular := regexp.QuoteMeta("WITH play_windows AS")
	recent := regexp.QuoteMeta("FROM play_events pe")
	for range 2 {
		mock.ExpectQuery(popular).WillReturnRows(sqlmock.NewRows([]string{"unused"}))
		mock.ExpectQuery(recent).WillReturnRows(sqlmock.NewRows([]string{"unused"}))
	}

	service := NewPlaybackService(&Database{db: db}, 0)
	loadLists := func() {
		t.Helper()
		if _, err := service.GetPopularTracks(30, false); err != nil {
			t.Fatal(err)
		}
		if _, err := service.GetRecentlyPlayed(30, false); err != nil {
			t.Fatal(err)
		}
	}
	loadLists()
	loadLists() // served from cache
	service.InvalidateDiscoveryLists()
	loadLists()
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func waitForInflight[K comparable, V any](t *testing.T, cache *ttlCache[K, V], key K) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		cache.mu.Lock()
		_, ok := cache.inflight[key]
		cache.mu.Unlock()
		if ok {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("load never started")
}
