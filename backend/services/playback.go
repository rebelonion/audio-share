package services

import (
	"database/sql"
	"fmt"
	"strings"
)

type PlaybackResult struct {
	ShareKey         string  `json:"shareKey"`
	Path             string  `json:"path"`
	Filename         string  `json:"filename"`
	Title            *string `json:"title"`
	Artist           *string `json:"artist"`
	ParentPath       *string `json:"parentPath"`
	ParentFolderName *string `json:"parentFolderName"`
	ParentShareKey   *string `json:"parentShareKey"`
	AudioImage       *string `json:"audioImage"`
	PosterImage      *string `json:"posterImage"`
	PlayCount        int     `json:"playCount"`
	LastPlayed       *string `json:"lastPlayed"`
}

type PlaybackService struct {
	db *Database
}

func NewPlaybackService(db *Database) *PlaybackService {
	return &PlaybackService{db: db}
}

func (s *PlaybackService) RecordPlayEvent(shareKey, sessionID string) error {
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

	// skip if same file was played in the last 5 minutes
	var recent int
	err = s.db.DB().QueryRow(
		"SELECT COUNT(*) FROM play_events WHERE audio_file_id = $1 AND played_at > NOW() - INTERVAL '5 minutes'",
		id,
	).Scan(&recent)
	if err != nil {
		return err
	}
	if recent > 0 {
		return nil
	}

	var sessionArg interface{}
	if sessionID != "" {
		sessionArg = sessionID
	}
	_, err = s.db.DB().Exec("INSERT INTO play_events (audio_file_id, session_id) VALUES ($1, $2)", id, sessionArg)
	return err
}

func (s *PlaybackService) GetRecommendations(shareKey string, limit int) ([]PlaybackResult, error) {
	// Co-occurrence: other tracks played in sessions where this track was played
	rows, err := s.db.DB().Query(`
		SELECT
			af.share_key,
			af.path,
			af.filename,
			af.title,
			af.meta_artist,
			af.parent_path,
			f.name,
			f.share_key,
			af.thumbnail,
			f.poster_image
		FROM play_events pe1
		JOIN audio_files target ON target.share_key = $1
		JOIN play_events pe2 ON pe2.session_id = pe1.session_id
			AND pe2.audio_file_id != target.id
			AND pe2.session_id IS NOT NULL
		JOIN audio_files af ON af.id = pe2.audio_file_id AND af.deleted = 0
		LEFT JOIN folders f ON f.path = af.parent_path
		WHERE pe1.audio_file_id = target.id
			AND pe1.session_id IS NOT NULL
		GROUP BY af.id, f.id
		ORDER BY RANDOM() ^ (1.0 / COUNT(DISTINCT pe2.session_id)) DESC
		LIMIT $2
	`, shareKey, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []PlaybackResult
	for rows.Next() {
		var r PlaybackResult
		if err := rows.Scan(
			&r.ShareKey, &r.Path, &r.Filename, &r.Title, &r.Artist,
			&r.ParentPath, &r.ParentFolderName, &r.ParentShareKey, &r.AudioImage, &r.PosterImage,
		); err != nil {
			return nil, err
		}
		results = append(results, r)
	}

	// Fill remainder with random tracks
	if len(results) < limit {
		needed := limit - len(results)
		excludeKeys := make([]interface{}, 0, len(results)+1)
		excludeKeys = append(excludeKeys, shareKey)
		for _, r := range results {
			excludeKeys = append(excludeKeys, r.ShareKey)
		}

		placeholders := make([]string, len(excludeKeys))
		for i := range excludeKeys {
			placeholders[i] = fmt.Sprintf("$%d", i+1)
		}
		excludeKeys = append(excludeKeys, needed)

		query := fmt.Sprintf(`
			SELECT
				af.share_key,
				af.path,
				af.filename,
				af.title,
				af.meta_artist,
				af.parent_path,
				f.name,
				f.share_key,
				af.thumbnail,
				f.poster_image
			FROM audio_files af
			LEFT JOIN folders f ON f.path = af.parent_path
			WHERE af.deleted = 0
				AND af.share_key NOT IN (%s)
			ORDER BY RANDOM()
			LIMIT $%d
		`, strings.Join(placeholders, ", "), len(excludeKeys))

		fillRows, err := s.db.DB().Query(query, excludeKeys...)
		if err != nil {
			return results, nil // return what we have on error
		}
		defer fillRows.Close()

		for fillRows.Next() {
			var r PlaybackResult
			if err := fillRows.Scan(
				&r.ShareKey, &r.Path, &r.Filename, &r.Title, &r.Artist,
				&r.ParentPath, &r.ParentFolderName, &r.ParentShareKey, &r.AudioImage, &r.PosterImage,
			); err != nil {
				return results, nil
			}
			results = append(results, r)
		}
	}

	if results == nil {
		results = []PlaybackResult{}
	}
	return results, nil
}

func (s *PlaybackService) GetRecentlyPlayed(limit int) ([]PlaybackResult, error) {
	rows, err := s.db.DB().Query(`
		SELECT
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
			COUNT(*) as play_count,
			MAX(pe.played_at) as last_played
		FROM play_events pe
		JOIN audio_files af ON af.id = pe.audio_file_id
		LEFT JOIN folders f ON f.path = af.parent_path
		WHERE af.deleted = 0
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
		if err := rows.Scan(
			&r.ShareKey, &r.Path, &r.Filename, &r.Title, &r.Artist,
			&r.ParentPath, &r.ParentFolderName, &r.ParentShareKey, &r.AudioImage, &r.PosterImage,
			&r.PlayCount, &r.LastPlayed,
		); err != nil {
			return nil, err
		}
		results = append(results, r)
	}

	if results == nil {
		results = []PlaybackResult{}
	}
	return results, nil
}

func (s *PlaybackService) GetPopularTracks(limit int) ([]PlaybackResult, error) {
	rows, err := s.db.DB().Query(`
		SELECT
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
			COUNT(*) as play_count,
			MAX(pe.played_at) as last_played
		FROM play_events pe
		JOIN audio_files af ON af.id = pe.audio_file_id
		LEFT JOIN folders f ON f.path = af.parent_path
		WHERE af.deleted = 0
		AND pe.played_at >= NOW() - INTERVAL '7 days'
		GROUP BY af.id, f.id
		ORDER BY play_count DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []PlaybackResult
	for rows.Next() {
		var r PlaybackResult
		if err := rows.Scan(
			&r.ShareKey, &r.Path, &r.Filename, &r.Title, &r.Artist,
			&r.ParentPath, &r.ParentFolderName, &r.ParentShareKey, &r.AudioImage, &r.PosterImage,
			&r.PlayCount, &r.LastPlayed,
		); err != nil {
			return nil, err
		}
		results = append(results, r)
	}

	if results == nil {
		results = []PlaybackResult{}
	}
	return results, nil
}

func (s *PlaybackService) GetRecentlyAdded(limit int) ([]PlaybackResult, error) {
	rows, err := s.db.DB().Query(`
		SELECT
			af.share_key,
			af.path,
			af.filename,
			af.title,
			af.meta_artist,
			af.parent_path,
			f.name,
			f.share_key,
			af.thumbnail,
			f.poster_image
		FROM audio_files af
		LEFT JOIN folders f ON f.path = af.parent_path
		WHERE af.downloaded_at IS NOT NULL AND af.deleted = 0
		ORDER BY af.downloaded_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []PlaybackResult
	for rows.Next() {
		var r PlaybackResult
		if err := rows.Scan(
			&r.ShareKey, &r.Path, &r.Filename, &r.Title, &r.Artist,
			&r.ParentPath, &r.ParentFolderName, &r.ParentShareKey, &r.AudioImage, &r.PosterImage,
		); err != nil {
			return nil, err
		}
		results = append(results, r)
	}

	if results == nil {
		results = []PlaybackResult{}
	}
	return results, nil
}

func (s *PlaybackService) GetRecentlyUnavailable(limit int) ([]PlaybackResult, error) {
	rows, err := s.db.DB().Query(`
		SELECT
			af.share_key,
			af.path,
			af.filename,
			af.title,
			af.meta_artist,
			af.parent_path,
			f.name,
			f.share_key,
			af.thumbnail,
			f.poster_image
		FROM audio_files af
		LEFT JOIN folders f ON f.path = af.parent_path
		WHERE af.unavailable_at IS NOT NULL AND af.deleted = 0
		ORDER BY af.unavailable_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []PlaybackResult
	for rows.Next() {
		var r PlaybackResult
		if err := rows.Scan(
			&r.ShareKey, &r.Path, &r.Filename, &r.Title, &r.Artist,
			&r.ParentPath, &r.ParentFolderName, &r.ParentShareKey, &r.AudioImage, &r.PosterImage,
		); err != nil {
			return nil, err
		}
		results = append(results, r)
	}

	if results == nil {
		results = []PlaybackResult{}
	}
	return results, nil
}
