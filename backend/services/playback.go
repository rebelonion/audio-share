package services

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"
)

const (
	playbackClaimCleanupInterval = 15 * time.Minute
	playbackClaimCleanupGrace    = 15 * time.Minute
	playbackClaimCleanupBatch    = 10_000
	playbackClaimCleanupBatches  = 10
)

const trackSummaryColumns = `
	af.share_key,
	af.path,
	af.filename,
	af.title,
	af.meta_artist,
	af.parent_path,
	f.name,
	f.share_key,
	af.thumbnail,
	f.poster_image,
	af.age_limit,
	af.removal_requested_at
`

type PlaybackResult struct {
	TrackSummary
	PlayCount  int     `json:"playCount"`
	LastPlayed *string `json:"lastPlayed"`
}

type UnavailablePlaybackResult struct {
	TrackSummary
	UnavailableAt *time.Time `json:"unavailableAt"`
}

func trackSummaryScanDest(track *TrackSummary) []any {
	return []any{
		&track.ShareKey,
		&track.Path,
		&track.Filename,
		&track.Title,
		&track.Artist,
		&track.ParentPath,
		&track.ParentFolderName,
		&track.ParentShareKey,
		&track.AudioImage,
		&track.PosterImage,
		&track.AgeLimit,
		&track.RemovalRequestedAt,
	}
}

func removalDiscoveryFilter(includeRemovalRequested bool) string {
	if includeRemovalRequested {
		return ""
	}
	return " AND af.removal_requested_at IS NULL"
}

type PlaybackService struct {
	db                 *Database
	legacyAccessKeyTTL time.Duration
}

func NewPlaybackService(db *Database, legacyAccessKeyTTL time.Duration) *PlaybackService {
	return &PlaybackService{
		db:                 db,
		legacyAccessKeyTTL: legacyAccessKeyTTL,
	}
}

func (s *PlaybackService) StartAccessKeyClaimCleanup() {
	cleanup := func() {
		var total int64
		for range playbackClaimCleanupBatches {
			deleted, err := s.cleanupExpiredAccessKeyClaims(playbackClaimCleanupBatch)
			if err != nil {
				log.Printf("Error cleaning expired playback access-key claims: %v", err)
				return
			}
			total += deleted
			if deleted < playbackClaimCleanupBatch {
				break
			}
		}
		if total > 0 {
			log.Printf("Removed %d expired playback access-key claims", total)
		}
	}

	cleanup()
	go func() {
		ticker := time.NewTicker(playbackClaimCleanupInterval)
		defer ticker.Stop()
		for range ticker.C {
			cleanup()
		}
	}()
}

func (s *PlaybackService) cleanupExpiredAccessKeyClaims(batchSize int) (int64, error) {
	tx, err := s.db.DB().Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`
		UPDATE playback_access_keys
		SET expires_at = NOW() + ($1 * INTERVAL '1 millisecond')
		WHERE expires_at IS NULL
	`, s.legacyAccessKeyTTL.Milliseconds()); err != nil {
		return 0, err
	}
	result, err := tx.Exec(`
		WITH expired AS (
			SELECT access_key_nonce
			FROM playback_access_keys
			WHERE expires_at <= NOW() - ($1 * INTERVAL '1 millisecond')
			ORDER BY expires_at
			LIMIT $2
			FOR UPDATE SKIP LOCKED
		)
		DELETE FROM playback_access_keys AS claim
		USING expired
		WHERE claim.access_key_nonce = expired.access_key_nonce
	`, playbackClaimCleanupGrace.Milliseconds(), batchSize)
	if err != nil {
		return 0, err
	}
	deleted, err := result.RowsAffected()
	if err != nil {
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return deleted, nil
}

func (s *PlaybackService) RecordPlayEvent(
	shareKey,
	sessionID,
	listeningSessionID,
	origin,
	accessKeyNonce string,
	accessKeyExpiresAt time.Time,
) error {
	var id int64
	err := s.db.DB().QueryRow(
		"SELECT id FROM audio_files WHERE share_key = $1 AND deleted = 0",
		shareKey,
	).Scan(&id)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}

	tx, err := s.db.DB().Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(
		"SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
		fmt.Sprintf("%d:%s", id, sessionID),
	); err != nil {
		return err
	}

	claim, err := tx.Exec(`
		INSERT INTO playback_access_keys (access_key_nonce, expires_at)
		VALUES ($1, $2)
		ON CONFLICT DO NOTHING
	`, accessKeyNonce, accessKeyExpiresAt)
	if err != nil {
		return err
	}
	claimed, err := claim.RowsAffected()
	if err != nil {
		return err
	}
	if claimed == 0 {
		return tx.Commit()
	}

	var recent int
	err = tx.QueryRow(
		"SELECT COUNT(*) FROM play_events WHERE audio_file_id = $1 AND session_id = $2 AND played_at > NOW() - INTERVAL '5 minutes'",
		id, sessionID,
	).Scan(&recent)
	if err != nil {
		return err
	}
	if recent > 0 {
		return tx.Commit()
	}

	var listeningSessionArg interface{}
	if listeningSessionID != "" {
		listeningSessionArg = listeningSessionID
	}
	_, err = tx.Exec(`
		INSERT INTO play_events (
			audio_file_id, session_id, listening_session_id, origin, access_key_nonce
		)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT DO NOTHING
	`, id, sessionID, listeningSessionArg, origin, accessKeyNonce)
	if err != nil {
		return err
	}
	return tx.Commit()
}

func (s *PlaybackService) GetRecommendations(shareKey string, limit int, includeRemovalRequested bool) ([]TrackSummary, error) {
	// Co-occurrence normalized by candidate's total session count (TF-IDF style):
	// score = co_sessions / total_candidate_sessions
	// This penalizes globally popular tracks that co-occur with everything.
	rows, err := s.db.DB().Query(`
		WITH normalized_events AS (
			SELECT
				audio_file_id,
				COALESCE(listening_session_id, session_id) AS recommendation_session_id
			FROM play_events
			WHERE COALESCE(listening_session_id, session_id) IS NOT NULL
		),
		candidate_totals AS (
			SELECT audio_file_id, COUNT(DISTINCT recommendation_session_id) AS total_sessions
			FROM normalized_events
			GROUP BY audio_file_id
		),
		co_occurrences AS (
			SELECT pe2.audio_file_id, COUNT(DISTINCT pe2.recommendation_session_id) AS co_count
			FROM normalized_events pe1
			JOIN audio_files target ON target.share_key = $1
			JOIN normalized_events pe2 ON pe2.recommendation_session_id = pe1.recommendation_session_id
				AND pe2.audio_file_id != target.id
			WHERE pe1.audio_file_id = target.id
			GROUP BY pe2.audio_file_id
		)
		SELECT `+trackSummaryColumns+`
		FROM co_occurrences co
		JOIN audio_files af ON af.id = co.audio_file_id AND af.deleted = 0 AND COALESCE(af.age_limit, 0) < 18`+removalDiscoveryFilter(includeRemovalRequested)+`
		LEFT JOIN folders f ON f.path = af.parent_path
		JOIN candidate_totals ct ON ct.audio_file_id = co.audio_file_id
		ORDER BY RANDOM() ^ (1.0 / GREATEST(
			co.co_count::float / ct.total_sessions,
			0.001
		)) DESC
		LIMIT $2
	`, shareKey, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []TrackSummary
	for rows.Next() {
		var track TrackSummary
		if err := rows.Scan(trackSummaryScanDest(&track)...); err != nil {
			return nil, err
		}
		results = append(results, track)
	}

	// Fill remainder with random tracks
	if len(results) < limit {
		needed := limit - len(results)
		excludeKeys := make([]interface{}, 0, len(results)+1)
		excludeKeys = append(excludeKeys, shareKey)
		for _, track := range results {
			excludeKeys = append(excludeKeys, track.ShareKey)
		}

		placeholders := make([]string, len(excludeKeys))
		for i := range excludeKeys {
			placeholders[i] = fmt.Sprintf("$%d", i+1)
		}
		excludeKeys = append(excludeKeys, needed)

		query := fmt.Sprintf(`
			SELECT %s
			FROM audio_files af
			LEFT JOIN folders f ON f.path = af.parent_path
			WHERE af.deleted = 0
				AND af.share_key NOT IN (%s)
				AND COALESCE(af.age_limit, 0) < 18
				%s
			ORDER BY RANDOM()
			LIMIT $%d
		`, trackSummaryColumns, strings.Join(placeholders, ", "), removalDiscoveryFilter(includeRemovalRequested), len(excludeKeys))

		fillRows, err := s.db.DB().Query(query, excludeKeys...)
		if err != nil {
			return results, nil // return what we have on error
		}
		defer fillRows.Close()

		for fillRows.Next() {
			var track TrackSummary
			if err := fillRows.Scan(trackSummaryScanDest(&track)...); err != nil {
				return results, nil
			}
			results = append(results, track)
		}
	}

	if results == nil {
		results = []TrackSummary{}
	}
	return results, nil
}

func (s *PlaybackService) GetRecentlyPlayed(limit int, includeRemovalRequested bool) ([]PlaybackResult, error) {
	rows, err := s.db.DB().Query(`
		SELECT `+trackSummaryColumns+`,
			COUNT(*) as play_count,
			MAX(pe.played_at) as last_played
		FROM play_events pe
		JOIN audio_files af ON af.id = pe.audio_file_id
		LEFT JOIN folders f ON f.path = af.parent_path
		WHERE af.deleted = 0 AND COALESCE(af.age_limit, 0) < 18`+removalDiscoveryFilter(includeRemovalRequested)+`
		GROUP BY af.id, f.id
		ORDER BY last_played DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []PlaybackResult
	for rows.Next() {
		var r PlaybackResult
		dest := append(trackSummaryScanDest(&r.TrackSummary), &r.PlayCount, &r.LastPlayed)
		if err := rows.Scan(dest...); err != nil {
			return nil, err
		}
		results = append(results, r)
	}

	if results == nil {
		results = []PlaybackResult{}
	}
	return results, nil
}

func (s *PlaybackService) GetPopularTracks(limit int, includeRemovalRequested bool) ([]PlaybackResult, error) {
	// Trending score: recent play rate vs historical baseline.
	// score = (plays_last_7d + 1) / (avg_plays_per_7d_over_prior_84d + 1)
	// Consistently popular items score ~1.0; items spiking above their norm score high.
	rows, err := s.db.DB().Query(`
		WITH play_windows AS (
			SELECT
				audio_file_id,
				COUNT(*) FILTER (WHERE played_at >= NOW() - INTERVAL '7 days') AS recent_7d,
				COUNT(*) FILTER (
					WHERE played_at < NOW() - INTERVAL '7 days'
					  AND played_at >= NOW() - INTERVAL '91 days'
				) AS older_84d
			FROM play_events
			GROUP BY audio_file_id
			HAVING COUNT(*) FILTER (WHERE played_at >= NOW() - INTERVAL '7 days') > 0
		)
		SELECT `+trackSummaryColumns+`,
			pw.recent_7d AS play_count,
			MAX(pe.played_at) AS last_played
		FROM play_windows pw
		JOIN audio_files af ON af.id = pw.audio_file_id AND af.deleted = 0 AND COALESCE(af.age_limit, 0) < 18`+removalDiscoveryFilter(includeRemovalRequested)+`
		JOIN play_events pe ON pe.audio_file_id = af.id
		LEFT JOIN folders f ON f.path = af.parent_path
		GROUP BY af.id, f.id, pw.recent_7d, pw.older_84d
		ORDER BY (pw.recent_7d + 1.0) / (pw.older_84d::float / 12.0 + 1.0) DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []PlaybackResult
	for rows.Next() {
		var r PlaybackResult
		dest := append(trackSummaryScanDest(&r.TrackSummary), &r.PlayCount, &r.LastPlayed)
		if err := rows.Scan(dest...); err != nil {
			return nil, err
		}
		results = append(results, r)
	}

	if results == nil {
		results = []PlaybackResult{}
	}
	return results, nil
}

func (s *PlaybackService) GetRecentlyAdded(limit int, includeRemovalRequested bool) ([]TrackSummary, error) {
	rows, err := s.db.DB().Query(`
		SELECT `+trackSummaryColumns+`
		FROM audio_files af
		LEFT JOIN folders f ON f.path = af.parent_path
		WHERE af.downloaded_at IS NOT NULL AND af.deleted = 0 AND COALESCE(af.age_limit, 0) < 18`+removalDiscoveryFilter(includeRemovalRequested)+`
		ORDER BY af.downloaded_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []TrackSummary
	for rows.Next() {
		var track TrackSummary
		if err := rows.Scan(trackSummaryScanDest(&track)...); err != nil {
			return nil, err
		}
		results = append(results, track)
	}

	if results == nil {
		results = []TrackSummary{}
	}
	return results, nil
}

func (s *PlaybackService) GetRecentlyUnavailable(limit int, includeRemovalRequested bool) ([]UnavailablePlaybackResult, error) {
	rows, err := s.db.DB().Query(`
		SELECT `+trackSummaryColumns+`,
			af.unavailable_at
		FROM audio_files af
		LEFT JOIN folders f ON f.path = af.parent_path
		WHERE af.unavailable_at IS NOT NULL AND af.deleted = 0 AND COALESCE(af.age_limit, 0) < 18`+removalDiscoveryFilter(includeRemovalRequested)+`
		ORDER BY af.unavailable_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []UnavailablePlaybackResult
	for rows.Next() {
		var result UnavailablePlaybackResult
		dest := append(trackSummaryScanDest(&result.TrackSummary), &result.UnavailableAt)
		if err := rows.Scan(dest...); err != nil {
			return nil, err
		}
		results = append(results, result)
	}

	if results == nil {
		results = []UnavailablePlaybackResult{}
	}
	return results, nil
}
