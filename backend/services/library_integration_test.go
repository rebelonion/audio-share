package services

import (
	"context"
	"testing"
)

func TestIntegrationLibraryReadsDoNotCreateProfiles(t *testing.T) {
	db := integrationDatabase(t)
	if err := db.Migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	library := NewLibraryService(db)
	profiles := func() int {
		t.Helper()
		var count int
		if err := db.db.QueryRow(`SELECT COUNT(*) FROM anonymous_profiles`).Scan(&count); err != nil {
			t.Fatal(err)
		}
		return count
	}

	const sessionID = "new-visitor"
	if keys, err := library.LikedTrackKeys(sessionID, false); err != nil || len(keys) != 0 {
		t.Fatalf("LikedTrackKeys() = %v, %v", keys, err)
	}
	if tracks, err := library.LikedTracks(sessionID, false); err != nil || len(tracks) != 0 {
		t.Fatalf("LikedTracks() = %v, %v", tracks, err)
	}
	if hasKey, err := library.ProfileHasRecoveryKey(sessionID); err != nil || hasKey {
		t.Fatalf("ProfileHasRecoveryKey() = %v, %v", hasKey, err)
	}
	if err := library.Unlike(sessionID, "missing-track"); err != nil {
		t.Fatal(err)
	}
	if count := profiles(); count != 0 {
		t.Fatalf("reads created %d profiles", count)
	}

	if _, err := library.RotateRecoveryKey(sessionID); err != nil {
		t.Fatal(err)
	}
	if hasKey, err := library.ProfileHasRecoveryKey(sessionID); err != nil || !hasKey {
		t.Fatalf("ProfileHasRecoveryKey() after rotation = %v, %v", hasKey, err)
	}
	if count := profiles(); count != 1 {
		t.Fatalf("recovery key rotation left %d profiles, want 1", count)
	}
}
