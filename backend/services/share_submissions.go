package services

import (
	"context"
	"time"
)

type ShareSubmissionsService struct {
	db *Database
}

func NewShareSubmissionsService(db *Database) *ShareSubmissionsService {
	return &ShareSubmissionsService{db: db}
}

// Count returns how many source requests a session has submitted, including
// history imported from Rybbit.
func (s *ShareSubmissionsService) Count(ctx context.Context, sessionID string) (int, error) {
	var count int
	err := s.db.DB().QueryRowContext(ctx,
		`SELECT count(*) FROM share_submissions WHERE session_id = $1`, sessionID,
	).Scan(&count)
	return count, err
}

// Record stores a delivered submission. An empty sourceKey (normalization
// failed) is stored as NULL and never matches HasRecentSource.
func (s *ShareSubmissionsService) Record(ctx context.Context, sessionID, submittedURL, sourceKey string) error {
	_, err := s.db.DB().ExecContext(ctx,
		`INSERT INTO share_submissions (session_id, submitted_url, source_key) VALUES ($1, $2, NULLIF($3, ''))`,
		sessionID, submittedURL, sourceKey,
	)
	return err
}

// HasRecentSource reports whether anyone submitted sourceKey after since.
func (s *ShareSubmissionsService) HasRecentSource(ctx context.Context, sourceKey string, since time.Time) (bool, error) {
	var exists bool
	err := s.db.DB().QueryRowContext(ctx,
		`SELECT EXISTS (SELECT 1 FROM share_submissions WHERE source_key = $1 AND created_at > $2)`,
		sourceKey, since,
	).Scan(&exists)
	return exists, err
}
