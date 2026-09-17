package services

import (
	"fmt"
	"testing"
	"time"
)

func TestIntegrationRecommendationsLowScores(t *testing.T) {
	db := integrationDatabase(t)
	db.DB().SetMaxOpenConns(1)
	if _, err := db.DB().Exec(initialSchema); err != nil {
		t.Fatal(err)
	}
	if _, err := db.DB().Exec(`
		INSERT INTO audio_files (id, path, filename, share_key) VALUES
			(1, 'target.mp3', 'target.mp3', 'target'),
			(2, 'candidate.mp3', 'candidate.mp3', 'candidate');
		INSERT INTO play_events (audio_file_id, session_id) VALUES (1, '1');
		INSERT INTO play_events (audio_file_id, session_id)
			SELECT 2, n::text FROM generate_series(1, 1000) AS n;
	`); err != nil {
		t.Fatal(err)
	}
	// Override random only in this test's isolated schema to exercise exact edge cases.
	if _, err := db.DB().Exec(`SELECT set_config('search_path', current_schema() || ',pg_catalog,public', false)`); err != nil {
		t.Fatal(err)
	}
	service := NewPlaybackService(db, time.Hour)
	for _, random := range []float64{0.01, 0, 0.9999999999999999} {
		t.Run(fmt.Sprint(random), func(t *testing.T) {
			if _, err := db.DB().Exec(fmt.Sprintf(`CREATE OR REPLACE FUNCTION random() RETURNS float8
				LANGUAGE SQL VOLATILE AS 'SELECT %g::float8'`, random)); err != nil {
				t.Fatal(err)
			}
			tracks, err := service.GetRecommendations("target", 1, false)
			if err != nil {
				t.Fatal(err)
			}
			if len(tracks) != 1 || tracks[0].ShareKey != "candidate" {
				t.Fatalf("expected low-scoring candidate, got %+v", tracks)
			}
		})
	}
}
