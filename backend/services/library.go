package services

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"errors"
	"strings"
	"time"
)

const recoveryKeyPrefix = "asr_"

var (
	ErrInvalidRecoveryKey = errors.New("invalid recovery key")
	ErrTrackNotFound      = errors.New("track not found")
)

type LibraryTrack struct {
	TrackSummary
	UnavailableAt *string `json:"unavailableAt,omitempty"`
	Deleted       bool    `json:"deleted"`
}

type LibraryService struct {
	db *Database
}

func NewLibraryService(db *Database) *LibraryService {
	return &LibraryService{db: db}
}

func (s *LibraryService) EnsureProfile(sessionID string) error {
	_, err := s.db.DB().Exec(`
		INSERT INTO anonymous_profiles (session_id)
		VALUES ($1)
		ON CONFLICT (session_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
	`, sessionID)
	return err
}

func (s *LibraryService) ProfileHasRecoveryKey(sessionID string) (bool, error) {
	var hasKey bool
	err := s.db.DB().QueryRow(`
		SELECT recovery_key_hash IS NOT NULL
		FROM anonymous_profiles
		WHERE session_id = $1
	`, sessionID).Scan(&hasKey)
	return hasKey, err
}

func generateRecoveryKey() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return recoveryKeyPrefix + base64.RawURLEncoding.EncodeToString(raw), nil
}

func hashRecoveryKey(key string) [sha256.Size]byte {
	return sha256.Sum256([]byte(key))
}

func validRecoveryKeyShape(key string) bool {
	if !strings.HasPrefix(key, recoveryKeyPrefix) {
		return false
	}
	raw, err := base64.RawURLEncoding.DecodeString(key[len(recoveryKeyPrefix):])
	return err == nil && len(raw) == 32
}

func (s *LibraryService) RotateRecoveryKey(sessionID string) (string, error) {
	if err := s.EnsureProfile(sessionID); err != nil {
		return "", err
	}
	key, err := generateRecoveryKey()
	if err != nil {
		return "", err
	}
	hash := hashRecoveryKey(key)
	_, err = s.db.DB().Exec(`
		UPDATE anonymous_profiles
		SET recovery_key_hash = $1, updated_at = CURRENT_TIMESTAMP
		WHERE session_id = $2
	`, hash[:], sessionID)
	if err != nil {
		return "", err
	}
	return key, nil
}

func (s *LibraryService) RecoverProfile(recoveryKey string) (string, error) {
	if !validRecoveryKeyShape(recoveryKey) {
		return "", ErrInvalidRecoveryKey
	}
	hash := hashRecoveryKey(recoveryKey)
	var sessionID string
	err := s.db.DB().QueryRow(`
		UPDATE anonymous_profiles
		SET updated_at = CURRENT_TIMESTAMP
		WHERE recovery_key_hash = $1
		RETURNING session_id
	`, hash[:]).Scan(&sessionID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrInvalidRecoveryKey
	}
	return sessionID, err
}

func (s *LibraryService) Like(sessionID, shareKey string, includeRemovalRequested bool) error {
	if err := s.EnsureProfile(sessionID); err != nil {
		return err
	}
	result, err := s.db.DB().Exec(`
		INSERT INTO likes (profile_id, audio_file_id)
		SELECT $1, id FROM audio_files
		WHERE share_key = $2 AND deleted = 0
		  AND ($3 OR removal_requested_at IS NULL)
		ON CONFLICT (profile_id, audio_file_id) DO UPDATE SET profile_id = EXCLUDED.profile_id
	`, sessionID, shareKey, includeRemovalRequested)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err == nil && rows == 0 {
		return ErrTrackNotFound
	}
	return err
}

func (s *LibraryService) Unlike(sessionID, shareKey string) error {
	_, err := s.db.DB().Exec(`
		DELETE FROM likes
		USING audio_files
		WHERE likes.audio_file_id = audio_files.id
		  AND likes.profile_id = $1
		  AND audio_files.share_key = $2
	`, sessionID, shareKey)
	return err
}

func (s *LibraryService) LikedTrackKeys(sessionID string, includeRemovalRequested bool) ([]string, error) {
	rows, err := s.db.DB().Query(`
		SELECT af.share_key
		FROM likes l
		JOIN audio_files af ON af.id = l.audio_file_id
		WHERE l.profile_id = $1
		  AND ($2 OR af.removal_requested_at IS NULL)
		ORDER BY l.created_at DESC
	`, sessionID, includeRemovalRequested)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	keys := make([]string, 0)
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return nil, err
		}
		keys = append(keys, key)
	}
	return keys, rows.Err()
}

func (s *LibraryService) LikedTracks(sessionID string, includeRemovalRequested bool) ([]LibraryTrack, error) {
	rows, err := s.db.DB().Query(`
		SELECT af.share_key, af.path, af.filename, af.title, af.meta_artist,
		       af.parent_path, f.name, f.share_key, af.thumbnail, f.poster_image,
		       af.age_limit, af.removal_requested_at, af.unavailable_at, af.deleted
		FROM likes l
		JOIN audio_files af ON af.id = l.audio_file_id
		LEFT JOIN folders f ON f.path = af.parent_path
		WHERE l.profile_id = $1
		  AND ($2 OR af.removal_requested_at IS NULL)
		ORDER BY l.created_at DESC
	`, sessionID, includeRemovalRequested)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tracks := make([]LibraryTrack, 0)
	for rows.Next() {
		var track LibraryTrack
		var unavailableAt sql.NullTime
		var deleted int
		if err := rows.Scan(
			&track.ShareKey, &track.Path, &track.Filename, &track.Title, &track.Artist,
			&track.ParentPath, &track.ParentFolderName, &track.ParentShareKey,
			&track.AudioImage, &track.PosterImage, &track.AgeLimit, &track.RemovalRequestedAt, &unavailableAt,
			&deleted,
		); err != nil {
			return nil, err
		}
		track.Deleted = deleted != 0
		if unavailableAt.Valid {
			value := unavailableAt.Time.UTC().Format(time.RFC3339)
			track.UnavailableAt = &value
		}
		tracks = append(tracks, track)
	}
	return tracks, rows.Err()
}
