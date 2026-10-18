package services

import (
	"context"
	"testing"
	"time"
)

func TestIntegrationBannerStore(t *testing.T) {
	db := integrationDatabase(t)
	ctx := context.Background()
	if err := db.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	store := NewBannerStore(db.db)
	if banner, err := store.Get(ctx); err != nil || banner != nil {
		t.Fatalf("initial banner = %+v, %v; want none", banner, err)
	}
	if _, err := store.Set(ctx, Banner{Message: "First", Variant: "warning"}); err != nil {
		t.Fatal(err)
	}
	saved, err := store.Set(ctx, Banner{Message: " Second ", LinkText: "More", LinkURL: "/requests"})
	if err != nil {
		t.Fatal(err)
	}
	want := Banner{Message: "Second", Variant: "info", LinkText: "More", LinkURL: "/requests"}
	if *saved != want {
		t.Fatalf("saved %+v, want %+v", *saved, want)
	}
	if got, err := store.Get(ctx); err != nil || got == nil || *got != want {
		t.Fatalf("stored %+v, %v; want %+v", got, err, want)
	}
	var rows int
	if err := db.db.QueryRow(`SELECT count(*) FROM site_banner`).Scan(&rows); err != nil || rows != 1 {
		t.Fatalf("rows = %d, %v; want 1", rows, err)
	}
	if _, err := store.Set(ctx, Banner{Message: "x", LinkText: "t"}); err == nil {
		t.Fatal("invalid banner saved")
	}

	// Another instance's cache picks up a change once its window passes.
	now := time.Now()
	other := NewBannerStore(db.db)
	other.now = func() time.Time { return now }
	if got, _ := other.Current(ctx); got == nil || *got != want {
		t.Fatalf("other instance sees %+v", got)
	}
	if err := store.Clear(ctx); err != nil {
		t.Fatal(err)
	}
	if got, _ := store.Current(ctx); got != nil {
		t.Fatalf("clearing instance still sees %+v", got)
	}
	if got, _ := other.Current(ctx); got == nil {
		t.Fatal("other instance refreshed before its cache window passed")
	}
	now = now.Add(bannerCacheTTL)
	other.Current(ctx) // serves the old value and starts a refresh
	waitForRead(other)
	if got, _ := other.Current(ctx); got != nil {
		t.Fatalf("other instance still sees %+v after its cache window", got)
	}
}
