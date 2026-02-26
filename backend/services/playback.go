package services

import "database/sql"

type PlaybackResult struct {
	Path             string  `json:"path"`
	Filename         string  `json:"filename"`
	Title            *string `json:"title"`
	Artist           *string `json:"artist"`
	ParentPath       *string `json:"parentPath"`
	ParentFolderName *string `json:"parentFolderName"`
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

func (s *PlaybackService) RecordPlayEvent(audioPath string) error {
	var id int64
	err := s.db.DB().QueryRow("SELECT id FROM audio_files WHERE path = ?", audioPath).Scan(&id)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}

	// skip if same file was played in the last 5 minutes
	var recent int
	err = s.db.DB().QueryRow(
		"SELECT COUNT(*) FROM play_events WHERE audio_file_id = ? AND played_at > datetime('now', '-5 minutes')",
		id,
	).Scan(&recent)
	if err != nil {
		return err
	}
	if recent > 0 {
		return nil
	}

	_, err = s.db.DB().Exec("INSERT INTO play_events (audio_file_id) VALUES (?)", id)
	return err
}

func (s *PlaybackService) GetRecentlyPlayed(limit int) ([]PlaybackResult, error) {
	rows, err := s.db.DB().Query(`
		SELECT
			af.path,
			af.filename,
			af.title,
			af.meta_artist,
			af.parent_path,
			f.name,
			af.thumbnail,
			f.poster_image,
			COUNT(*) as play_count,
			MAX(pe.played_at) as last_played
		FROM play_events pe
		JOIN audio_files af ON af.id = pe.audio_file_id
		LEFT JOIN folders f ON f.path = af.parent_path
		GROUP BY pe.audio_file_id
		ORDER BY last_played DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []PlaybackResult
	for rows.Next() {
		var r PlaybackResult
		if err := rows.Scan(
			&r.Path, &r.Filename, &r.Title, &r.Artist,
			&r.ParentPath, &r.ParentFolderName, &r.AudioImage, &r.PosterImage,
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
			af.path,
			af.filename,
			af.title,
			af.meta_artist,
			af.parent_path,
			f.name,
			af.thumbnail,
			f.poster_image,
			COUNT(*) as play_count,
			MAX(pe.played_at) as last_played
		FROM play_events pe
		JOIN audio_files af ON af.id = pe.audio_file_id
		LEFT JOIN folders f ON f.path = af.parent_path
		GROUP BY pe.audio_file_id
		ORDER BY play_count DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []PlaybackResult
	for rows.Next() {
		var r PlaybackResult
		if err := rows.Scan(
			&r.Path, &r.Filename, &r.Title, &r.Artist,
			&r.ParentPath, &r.ParentFolderName, &r.AudioImage, &r.PosterImage,
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
			af.path,
			af.filename,
			af.title,
			af.meta_artist,
			af.parent_path,
			f.name,
			af.thumbnail,
			f.poster_image
		FROM audio_files af
		LEFT JOIN folders f ON f.path = af.parent_path
		WHERE af.downloaded_at IS NOT NULL
		ORDER BY af.downloaded_at DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []PlaybackResult
	for rows.Next() {
		var r PlaybackResult
		if err := rows.Scan(
			&r.Path, &r.Filename, &r.Title, &r.Artist,
			&r.ParentPath, &r.ParentFolderName, &r.AudioImage, &r.PosterImage,
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
