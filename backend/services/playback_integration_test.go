package services

import (
	"context"
	"testing"
)

func TestIntegrationPopularBanlistMatchesTitleOrFilename(t *testing.T) {
	db := integrationDatabase(t)
	if err := db.Migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, err := db.db.Exec(`
		INSERT INTO audio_files (path, filename, title, share_key) VALUES
			('audio/kept.mp3', 'kept.mp3', 'Kept', 'kept'),
			('audio/titled.mp3', 'titled.mp3', 'Gentle ASMR', 'banned-title'),
			('audio/ASMR.mp3', 'ASMR.mp3', '', 'banned-empty-title'),
			('audio/null.asmr.mp3', 'null.asmr.mp3', NULL, 'banned-null-title');
		INSERT INTO play_events (audio_file_id) SELECT id FROM audio_files;
	`); err != nil {
		t.Fatal(err)
	}

	service := NewPlaybackService(db, 0)
	service.SetPopularBanlist([]string{"asmr"})
	tracks, err := service.GetPopularTracks(30, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(tracks) != 1 || tracks[0].ShareKey != "kept" {
		keys := make([]string, len(tracks))
		for i, track := range tracks {
			keys[i] = track.ShareKey
		}
		t.Fatalf("popular share keys = %q, want [kept]", keys)
	}

	service.SetPopularBanlist(nil)
	tracks, err = service.GetPopularTracks(30, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(tracks) != 4 {
		t.Fatalf("got %d popular tracks without a banlist, want 4", len(tracks))
	}
}
