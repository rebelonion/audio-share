package services

import (
	"database/sql"
	"time"
)

type SearchResult struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	Path       string `json:"path"`
	Type       string `json:"type"`
	ParentPath string `json:"parentPath,omitempty"`
	ShareKey   string `json:"shareKey,omitempty"`

	// Audio fields
	Size        int64  `json:"size,omitempty"`
	MimeType    string `json:"mimeType,omitempty"`
	Title       string `json:"title,omitempty"`
	Artist      string `json:"artist,omitempty"`
	Description string `json:"description,omitempty"`
	WebpageURL  string `json:"webpageUrl,omitempty"`

	// Folder fields
	OriginalURL   string `json:"originalUrl,omitempty"`
	ItemCount     int    `json:"itemCount,omitempty"`
	DirectorySize string `json:"directorySize,omitempty"`
	PosterImage   string `json:"posterImage,omitempty"`

	ModifiedAt    string  `json:"modifiedAt,omitempty"`
	UnavailableAt *string `json:"unavailableAt,omitempty"`
}

type SearchService struct {
	db             *Database
	fs             *FileSystemService
	webhookService *WebhookService
	lockPath       string
}

func NewSearchService(db *Database, fs *FileSystemService, webhookService *WebhookService) *SearchService {
	return &SearchService{
		db:             db,
		fs:             fs,
		webhookService: webhookService,
		lockPath:       "/tmp/audio-share.reindex.lock",
	}
}

func (s *SearchService) Search(query string, limit int, offset int) ([]SearchResult, int, error) {
	if limit <= 0 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	likeQuery := "%" + query + "%"

	var total int
	err := s.db.DB().QueryRow(`
		SELECT (
			SELECT COUNT(*) FROM folders
			WHERE name ILIKE $1 OR folder_name ILIKE $2
		) + (
			SELECT COUNT(*) FROM audio_files
			WHERE (filename ILIKE $3 OR title ILIKE $4 OR meta_artist ILIKE $5 OR description ILIKE $6)
			AND deleted = 0
		)
	`, likeQuery, likeQuery, likeQuery, likeQuery, likeQuery, likeQuery).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	rows, err := s.db.DB().Query(`
		SELECT
			id, name, path, 'folder' as type, parent_path,
			NULL as size, NULL as mime_type, NULL as title, NULL as artist,
			NULL as description, NULL as webpage_url,
			original_url, item_count, directory_size, poster_image, modified_at,
			share_key, NULL::timestamptz as unavailable_at
		FROM folders
		WHERE name ILIKE $1 OR folder_name ILIKE $2

		UNION ALL

		SELECT
			id, COALESCE(NULLIF(title, ''), filename) as name, path, 'audio' as type, parent_path,
			size, mime_type, title, meta_artist as artist,
			description, webpage_url,
			NULL as original_url, NULL as item_count, NULL as directory_size, NULL as poster_image, modified_at,
			share_key, unavailable_at
		FROM audio_files
		WHERE (filename ILIKE $3 OR title ILIKE $4 OR meta_artist ILIKE $5 OR description ILIKE $6)
		AND deleted = 0

		LIMIT $7 OFFSET $8
	`, likeQuery, likeQuery, likeQuery, likeQuery, likeQuery, likeQuery, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var results []SearchResult
	for rows.Next() {
		var r SearchResult
		var parentPath, mimeType, title, artist, description, webpageURL *string
		var originalURL, directorySize, posterImage, modifiedAt, shareKey *string
		var size, itemCount *int64
		var unavailableAt sql.NullTime

		if err := rows.Scan(
			&r.ID, &r.Name, &r.Path, &r.Type, &parentPath,
			&size, &mimeType, &title, &artist, &description, &webpageURL,
			&originalURL, &itemCount, &directorySize, &posterImage, &modifiedAt,
			&shareKey, &unavailableAt,
		); err != nil {
			return nil, 0, err
		}
		if unavailableAt.Valid {
			s := unavailableAt.Time.UTC().Format(time.RFC3339)
			r.UnavailableAt = &s
		}

		if parentPath != nil {
			r.ParentPath = *parentPath
		}
		if size != nil {
			r.Size = *size
		}
		if mimeType != nil {
			r.MimeType = *mimeType
		}
		if title != nil {
			r.Title = *title
		}
		if artist != nil {
			r.Artist = *artist
		}
		if description != nil {
			r.Description = *description
		}
		if webpageURL != nil {
			r.WebpageURL = *webpageURL
		}
		if originalURL != nil {
			r.OriginalURL = *originalURL
		}
		if itemCount != nil {
			r.ItemCount = int(*itemCount)
		}
		if directorySize != nil {
			r.DirectorySize = *directorySize
		}
		if posterImage != nil {
			r.PosterImage = *posterImage
		}
		if modifiedAt != nil {
			r.ModifiedAt = *modifiedAt
		}
		if shareKey != nil {
			r.ShareKey = *shareKey
		}

		results = append(results, r)
	}

	return results, total, nil
}

func (s *SearchService) RandomAudio() (string, error) {
	var shareKey string
	err := s.db.DB().QueryRow(`
		SELECT share_key FROM audio_files
		WHERE deleted = 0 AND share_key IS NOT NULL
		ORDER BY RANDOM() LIMIT 1
	`).Scan(&shareKey)
	if err != nil {
		return "", err
	}
	return shareKey, nil
}
