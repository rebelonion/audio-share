package services

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestBannerNormalize(t *testing.T) {
	got, err := Banner{Message: "  Requests are delayed.  ", LinkText: " More ", LinkURL: " /requests "}.Normalize()
	if err != nil {
		t.Fatal(err)
	}
	if want := (Banner{Message: "Requests are delayed.", Variant: "info", LinkText: "More", LinkURL: "/requests"}); got != want {
		t.Fatalf("got %+v, want %+v", got, want)
	}
	for _, link := range []string{"https://example.com/notes", "http://example.com", "/about?x=1"} {
		if _, err := (Banner{Message: "m", LinkText: "t", LinkURL: link}).Normalize(); err != nil {
			t.Errorf("link %q rejected: %v", link, err)
		}
	}
}

func TestBannerNormalizeAcceptsTokens(t *testing.T) {
	for _, message := range []string{
		"Live {countdown:2026-10-20T18:00Z|now} at {time:2026-10-20T13:00-05:00}",
		"{datetime:2026-10-20T18:00:30.5Z} {date:2026-10-20t18:00z} {relative: 2026-10-20T18:00:00+02:00 }",
		"Unknown {placeholders} and {other:stuff} stay as text",
	} {
		if _, err := (Banner{Message: message}).Normalize(); err != nil {
			t.Errorf("%q rejected: %v", message, err)
		}
	}
}

func TestBannerNormalizeRejectsInvalid(t *testing.T) {
	for name, banner := range map[string]Banner{
		"empty message":      {Message: "   "},
		"long message":       {Message: strings.Repeat("a", maxBannerMessage+1)},
		"unknown variant":    {Message: "m", Variant: "danger"},
		"text without url":   {Message: "m", LinkText: "t"},
		"url without text":   {Message: "m", LinkURL: "/requests"},
		"javascript url":     {Message: "m", LinkText: "t", LinkURL: "javascript:alert(1)"},
		"protocol relative":  {Message: "m", LinkText: "t", LinkURL: "//evil.example"},
		"backslash relative": {Message: "m", LinkText: "t", LinkURL: "/\\evil.example"},
		"relative path":      {Message: "m", LinkText: "t", LinkURL: "requests"},
		"tab-split slashes":  {Message: "m", LinkText: "t", LinkURL: "/\t/evil.example"},
		"newline-split":      {Message: "m", LinkText: "t", LinkURL: "/\n/evil.example"},
		"backslash later":    {Message: "m", LinkText: "t", LinkURL: "/a\\b"},
		"control character":  {Message: "m", LinkText: "t", LinkURL: "/\x00/evil.example"},
		"space in url":       {Message: "m", LinkText: "t", LinkURL: "https://example.com/a b"},
		"long link text":     {Message: "m", LinkText: strings.Repeat("a", maxBannerLinkText+1), LinkURL: "/"},
		"token without zone": {Message: "Starts {time:2026-10-20T18:00}"},
		"token bad date":     {Message: "Starts {date:2026-13-20T18:00Z}"},
		"token not a time":   {Message: "Starts {countdown:soon}"},
		"end text on date":   {Message: "Starts {date:2026-10-20T18:00Z|now}"},
	} {
		_, err := banner.Normalize()
		if _, ok := err.(*BannerError); !ok {
			t.Errorf("%s: got %v, want BannerError", name, err)
		}
	}
}

// waitForRead blocks until the store's shared read has finished.
func waitForRead(store *BannerStore) {
	store.mu.Lock()
	read := store.inflight
	store.mu.Unlock()
	if read != nil {
		<-read.done
	}
}

func TestBannerCurrentServesStaleValueWhileRefreshing(t *testing.T) {
	now := time.Now()
	stale := &Banner{Message: "old", Variant: "info"}
	store := &BannerStore{now: func() time.Time { return now }, cached: stale, fetchedAt: now.Add(-bannerCacheTTL)}
	release := make(chan struct{})
	store.load = func(context.Context) (*Banner, error) {
		<-release
		return &Banner{Message: "fresh", Variant: "info"}, nil
	}
	for range 2 {
		got := make(chan *Banner)
		go func() { b, _ := store.Current(context.Background()); got <- b }()
		select {
		case b := <-got:
			if b != stale {
				t.Fatalf("got %+v during refresh, want stale value", b)
			}
		case <-time.After(time.Second):
			t.Fatal("caller blocked on the refresh")
		}
	}
	close(release)
	waitForRead(store)
	if b, _ := store.Current(context.Background()); b == nil || b.Message != "fresh" {
		t.Fatalf("cache holds %+v after refresh", b)
	}
}

func TestBannerCurrentWaitsForFirstLoad(t *testing.T) {
	store := &BannerStore{now: time.Now, coldWait: time.Minute}
	started, release := make(chan struct{}), make(chan struct{})
	calls := 0
	store.load = func(ctx context.Context) (*Banner, error) {
		calls++
		close(started)
		<-release
		// The read does not inherit a visitor's cancellation.
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		return &Banner{Message: "live", Variant: "info"}, nil
	}
	// The visitor who triggered the read disconnects.
	cancelled, cancel := context.WithCancel(context.Background())
	first := make(chan error)
	go func() { _, err := store.Current(cancelled); first <- err }()
	<-started
	cancel()
	if err := <-first; !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled caller got %v", err)
	}
	// Other cold-start callers wait for the shared read rather than getting nil.
	results := make(chan *Banner, 3)
	for range 3 {
		go func() { b, _ := store.Current(context.Background()); results <- b }()
	}
	close(release)
	for range 3 {
		if b := <-results; b == nil || b.Message != "live" {
			t.Fatalf("cold-start caller got %+v", b)
		}
	}
	if calls != 1 {
		t.Fatalf("%d reads, want one shared read", calls)
	}
}

func TestBannerCurrentKeepsNewerWriteOverInFlightRead(t *testing.T) {
	store := &BannerStore{now: time.Now, coldWait: time.Minute}
	started, release := make(chan struct{}), make(chan struct{})
	store.load = func(context.Context) (*Banner, error) {
		close(started)
		<-release
		return &Banner{Message: "read before write", Variant: "info"}, nil
	}
	done := make(chan *Banner)
	go func() { b, _ := store.Current(context.Background()); done <- b }()
	<-started
	store.store(nil) // a Clear lands while the read is in flight
	close(release)
	if b := <-done; b != nil {
		t.Fatalf("waiting caller got the stale read: %+v", b)
	}
	if b, _ := store.Current(context.Background()); b != nil {
		t.Fatalf("stale read overwrote the clear: %+v", b)
	}
}

func TestBannerCurrentRecoversFromPanickingRead(t *testing.T) {
	now := time.Now()
	store := &BannerStore{now: func() time.Time { return now }, coldWait: time.Minute}
	store.load = func(context.Context) (*Banner, error) { panic("driver bug") }
	if _, err := store.Current(context.Background()); err == nil {
		t.Fatal("want error from panicking read")
	}
	now = now.Add(bannerCacheTTL)
	store.load = func(context.Context) (*Banner, error) { return &Banner{Message: "back", Variant: "info"}, nil }
	if b, _ := store.Current(context.Background()); b != nil {
		t.Fatalf("got %+v; want the previous value while the refresh runs", b)
	}
	waitForRead(store)
	if b, _ := store.Current(context.Background()); b == nil || b.Message != "back" {
		t.Fatalf("cache stuck after panic: %+v", b)
	}
}

func TestBannerCurrentBacksOffAfterFailure(t *testing.T) {
	now := time.Now()
	calls := 0
	store := &BannerStore{now: func() time.Time { return now }, coldWait: time.Minute}
	store.load = func(context.Context) (*Banner, error) { calls++; return nil, errors.New("db down") }
	if _, err := store.Current(context.Background()); err == nil {
		t.Fatal("want error from first read")
	}
	store.Current(context.Background())
	if calls != 1 {
		t.Fatalf("retried within the cache window: %d calls", calls)
	}
}

func TestBannerCurrentDoesNotHoldPagesOnSlowFirstLoad(t *testing.T) {
	store := &BannerStore{now: time.Now, coldWait: 10 * time.Millisecond}
	release := make(chan struct{})
	store.load = func(context.Context) (*Banner, error) {
		<-release
		return &Banner{Message: "late", Variant: "info"}, nil
	}
	started := time.Now()
	if b, err := store.Current(context.Background()); b != nil || err != nil {
		t.Fatalf("got %+v, %v; want no banner and no error", b, err)
	}
	if waited := time.Since(started); waited > time.Second {
		t.Fatalf("waited %v on a slow first load", waited)
	}
	close(release)
	waitForRead(store)
	if b, _ := store.Current(context.Background()); b == nil || b.Message != "late" {
		t.Fatalf("background read did not fill the cache: %+v", b)
	}
}
