package services

import (
	"context"
	"testing"
)

func TestIntegrationSearchMatchesWebpageURLBySourceID(t *testing.T) {
	db := integrationDatabase(t)
	if err := db.Migrate(context.Background()); err != nil {
		t.Fatal(err)
	}

	const sourceID = "sbMWc0J30SQ"
	if _, err := db.db.Exec(`
		INSERT INTO audio_files (path, filename, webpage_url, share_key)
		VALUES ('audio/example.mp3', 'example.mp3', 'https://www.youtube.com/watch?v=` + sourceID + `', 'example-key')
	`); err != nil {
		t.Fatal(err)
	}

	service := NewSearchService(db, nil, nil)
	results, total, err := service.Search(sourceID, 50, 0, SearchOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if total != 1 || len(results) != 1 {
		t.Fatalf("got total %d and %d results, want one result", total, len(results))
	}
	if results[0].ShareKey != "example-key" {
		t.Fatalf("share key = %q, want example-key", results[0].ShareKey)
	}
}
