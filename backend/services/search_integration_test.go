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

func TestIntegrationSearchRelevanceAndStablePagination(t *testing.T) {
	db := integrationDatabase(t)
	if err := db.Migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	_, err := db.db.Exec(`INSERT INTO audio_files(path, filename, title, meta_artist, description, share_key) VALUES
 ('a','a.mp3','A description match','','listen to rain','a'),
 ('b','b.mp3','Rain','','','b'),
 ('c','c.mp3','Rain storm','','','c'),
 ('d','d.mp3','Z artist match','Rain','','d'),
 ('e','e.mp3','Rain','','','e');
 INSERT INTO folders(path,folder_name,name) VALUES('folder','rain','Rain')`)
	if err != nil {
		t.Fatal(err)
	}
	service := NewSearchService(db, nil, nil)
	results, total, err := service.Search("rain", 50, 0, SearchOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if total != 6 || len(results) != 6 {
		t.Fatalf("total=%d results=%d", total, len(results))
	}
	for i, key := range []string{"b", "e", "", "d", "c", "a"} {
		if results[i].ShareKey != key {
			t.Fatalf("result %d = %+v, want key %q", i, results[i], key)
		}
	}
	page, total, err := service.Search("rain", 1, 1, SearchOptions{})
	if err != nil || total != 6 || len(page) != 1 || page[0].ShareKey != "e" {
		t.Fatalf("page=%+v total=%d err=%v", page, total, err)
	}
	if _, _, err := service.Search("rain", 50, 0, SearchOptions{Fields: []string{"invalid"}}); err != nil {
		t.Fatalf("invalid fields must fall back to all fields: %v", err)
	}
	alphabetical, _, err := service.Search("rain", 50, 0, SearchOptions{Sort: "name_asc"})
	if err != nil || alphabetical[0].ShareKey != "a" {
		t.Fatalf("alphabetical=%+v err=%v", alphabetical, err)
	}
	selected, total, err := service.Search("rain", 50, 0, SearchOptions{Type: "audio", Fields: []string{"description"}})
	if err != nil || total != 1 || selected[0].ShareKey != "a" {
		t.Fatalf("selected=%+v total=%d err=%v", selected, total, err)
	}
}
