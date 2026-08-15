package services

import (
	"errors"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestRecoveryKeyGenerationAndValidation(t *testing.T) {
	seen := make(map[string]bool)
	for i := 0; i < 100; i++ {
		key, err := generateRecoveryKey()
		if err != nil {
			t.Fatalf("generateRecoveryKey: %v", err)
		}
		if !validRecoveryKeyShape(key) {
			t.Fatalf("generated key was rejected: %q", key)
		}
		if seen[key] {
			t.Fatalf("duplicate recovery key generated")
		}
		seen[key] = true
	}
}

func TestRecoveryKeyValidationRejectsMalformedValues(t *testing.T) {
	invalid := []string{"", "asr_", "wrong_AAAA", "asr_not-base64!", "asr_YQ"}
	for _, value := range invalid {
		if validRecoveryKeyShape(value) {
			t.Errorf("accepted malformed key %q", value)
		}
	}
}

func TestRecoveryKeyHashIsStableAndSensitive(t *testing.T) {
	one := hashRecoveryKey("asr_one")
	two := hashRecoveryKey("asr_two")
	if one == two {
		t.Fatal("different recovery keys produced the same hash")
	}
	if one != hashRecoveryKey("asr_one") {
		t.Fatal("same recovery key produced a different hash")
	}
}

func newMockLibraryService(t *testing.T) (*LibraryService, sqlmock.Sqlmock) {
	t.Helper()
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create mock database: %v", err)
	}
	t.Cleanup(func() {
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Errorf("unmet database expectations: %v", err)
		}
		db.Close()
	})
	return NewLibraryService(&Database{db: db}), mock
}

func expectProfileUpsert(mock sqlmock.Sqlmock, sessionID string) {
	mock.ExpectExec(regexp.QuoteMeta(`
		INSERT INTO anonymous_profiles (session_id)
		VALUES ($1)
		ON CONFLICT (session_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
	`)).
		WithArgs(sessionID).
		WillReturnResult(sqlmock.NewResult(0, 1))
}

func TestLikeIsIdempotentAndReportsMissingTracks(t *testing.T) {
	const (
		sessionID = "profile-id"
		shareKey  = "track-key"
	)

	t.Run("existing track", func(t *testing.T) {
		service, mock := newMockLibraryService(t)
		for range 2 {
			expectProfileUpsert(mock, sessionID)
			mock.ExpectExec(regexp.QuoteMeta(`
				INSERT INTO likes (profile_id, audio_file_id)
				SELECT $1, id FROM audio_files
				WHERE share_key = $2 AND deleted = 0
				  AND ($3 OR removal_requested_at IS NULL)
				ON CONFLICT (profile_id, audio_file_id) DO UPDATE SET profile_id = EXCLUDED.profile_id
			`)).
				WithArgs(sessionID, shareKey, false).
				WillReturnResult(sqlmock.NewResult(0, 1))
		}

		for attempt := range 2 {
			if err := service.Like(sessionID, shareKey, false); err != nil {
				t.Fatalf("Like attempt %d: %v", attempt+1, err)
			}
		}
	})

	t.Run("missing track", func(t *testing.T) {
		service, mock := newMockLibraryService(t)
		expectProfileUpsert(mock, sessionID)
		mock.ExpectExec(regexp.QuoteMeta(`
			INSERT INTO likes (profile_id, audio_file_id)
			SELECT $1, id FROM audio_files
			WHERE share_key = $2 AND deleted = 0
			  AND ($3 OR removal_requested_at IS NULL)
			ON CONFLICT (profile_id, audio_file_id) DO UPDATE SET profile_id = EXCLUDED.profile_id
		`)).
			WithArgs(sessionID, shareKey, false).
			WillReturnResult(sqlmock.NewResult(0, 0))

		if err := service.Like(sessionID, shareKey, false); !errors.Is(err, ErrTrackNotFound) {
			t.Fatalf("Like error = %v, want ErrTrackNotFound", err)
		}
	})
}

func TestRecoverProfileLooksUpHashedKey(t *testing.T) {
	service, mock := newMockLibraryService(t)
	key, err := generateRecoveryKey()
	if err != nil {
		t.Fatalf("generateRecoveryKey: %v", err)
	}
	hash := hashRecoveryKey(key)
	mock.ExpectQuery(regexp.QuoteMeta(`
		UPDATE anonymous_profiles
		SET updated_at = CURRENT_TIMESTAMP
		WHERE recovery_key_hash = $1
		RETURNING session_id
	`)).
		WithArgs(hash[:]).
		WillReturnRows(sqlmock.NewRows([]string{"session_id"}).AddRow("profile-id"))

	profileID, err := service.RecoverProfile(key)
	if err != nil {
		t.Fatalf("RecoverProfile: %v", err)
	}
	if profileID != "profile-id" {
		t.Fatalf("profileID = %q, want profile-id", profileID)
	}
}

func TestLikedTracksScansSharedTrackSummary(t *testing.T) {
	service, mock := newMockLibraryService(t)
	requestedAt := time.Date(2026, time.August, 14, 18, 0, 0, 0, time.UTC)
	mock.ExpectQuery(regexp.QuoteMeta(`
		SELECT af.share_key, af.path, af.filename, af.title, af.meta_artist,
		       af.parent_path, f.name, f.share_key, af.thumbnail, f.poster_image,
		       af.age_limit, af.removal_requested_at, af.unavailable_at, af.deleted
		FROM likes l
		JOIN audio_files af ON af.id = l.audio_file_id
		LEFT JOIN folders f ON f.path = af.parent_path
		WHERE l.profile_id = $1
		  AND ($2 OR af.removal_requested_at IS NULL)
		ORDER BY l.created_at DESC
	`)).
		WithArgs("profile-id", true).
		WillReturnRows(sqlmock.NewRows([]string{
			"share_key", "path", "filename", "title", "meta_artist",
			"parent_path", "folder_name", "folder_share_key", "thumbnail", "poster_image",
			"age_limit", "removal_requested_at", "unavailable_at", "deleted",
		}).AddRow(
			"track-key", "folder/track.mp3", "track.mp3", "Track", "Artist",
			"folder", "Folder", "folder-key", "thumbnail.jpg", "poster.jpg",
			0, requestedAt, nil, 0,
		))

	tracks, err := service.LikedTracks("profile-id", true)
	if err != nil {
		t.Fatalf("LikedTracks: %v", err)
	}
	if len(tracks) != 1 || tracks[0].ShareKey != "track-key" || tracks[0].Artist == nil ||
		tracks[0].RemovalRequestedAt == nil || !tracks[0].RemovalRequestedAt.Equal(requestedAt) {
		t.Fatalf("unexpected tracks: %#v", tracks)
	}
}

func TestLikedTrackKeysReturnsLightweightMembership(t *testing.T) {
	service, mock := newMockLibraryService(t)
	mock.ExpectQuery(regexp.QuoteMeta(`
		SELECT af.share_key
		FROM likes l
		JOIN audio_files af ON af.id = l.audio_file_id
		WHERE l.profile_id = $1
		  AND ($2 OR af.removal_requested_at IS NULL)
		ORDER BY l.created_at DESC
	`)).
		WithArgs("profile-id", false).
		WillReturnRows(sqlmock.NewRows([]string{"share_key"}).
			AddRow("newest-track").
			AddRow("older-track"))

	keys, err := service.LikedTrackKeys("profile-id", false)
	if err != nil {
		t.Fatalf("LikedTrackKeys: %v", err)
	}
	if len(keys) != 2 || keys[0] != "newest-track" || keys[1] != "older-track" {
		t.Fatalf("unexpected keys: %#v", keys)
	}
}
