package services

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"time"
)

var ErrNotFound = errors.New("not found")

type Tag struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

type SourceRequest struct {
	ID             int64   `json:"id"`
	SubmittedURL   string  `json:"submittedUrl"`
	SourceKey      string  `json:"sourceKey,omitempty"`
	Title          string  `json:"title"`
	Status         string  `json:"status"`
	Tags           []Tag   `json:"tags"`
	FolderShareKey *string `json:"folderShareKey,omitempty"`
	FolderPath     *string `json:"folderPath,omitempty"`
	CreatedAt      string  `json:"createdAt"`
	UpdatedAt      string  `json:"updatedAt"`
}

type RequestsByStatus struct {
	Requested   []SourceRequest `json:"requested"`
	Downloading []SourceRequest `json:"downloading"`
	Indexing    []SourceRequest `json:"indexing"`
	Added       []SourceRequest `json:"added"`
	Rejected    []SourceRequest `json:"rejected"`
}

type RequestsService struct {
	db *Database
}

type ExistingSourceRequest struct {
	ID           int64   `json:"id"`
	SubmittedURL string  `json:"submittedUrl"`
	Title        string  `json:"title"`
	Status       string  `json:"status"`
	FolderPath   *string `json:"folderPath,omitempty"`
}

func NewRequestsService(db *Database) *RequestsService {
	return &RequestsService{db: db}
}

func (s *RequestsService) GetAllGroupedByStatus() (*RequestsByStatus, error) {
	rows, err := s.db.DB().Query(`
		SELECT sr.id, sr.submitted_url, sr.title, sr.status, sr.tags, f.share_key, f.path, sr.created_at, sr.updated_at
		FROM source_requests sr
		LEFT JOIN collections c ON c.id=sr.collection_id
		LEFT JOIN folders f ON f.path=c.path
		ORDER BY sr.created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := &RequestsByStatus{
		Requested:   []SourceRequest{},
		Downloading: []SourceRequest{},
		Indexing:    []SourceRequest{},
		Added:       []SourceRequest{},
		Rejected:    []SourceRequest{},
	}

	for rows.Next() {
		var req SourceRequest
		var folderShareKey, folderPath *string
		var tagsJSON sql.NullString
		var createdAt, updatedAt time.Time

		if err := rows.Scan(
			&req.ID, &req.SubmittedURL, &req.Title,
			&req.Status, &tagsJSON, &folderShareKey, &folderPath, &createdAt, &updatedAt,
		); err != nil {
			return nil, err
		}
		req.CreatedAt = createdAt.UTC().Format("2006-01-02T15:04:05Z")
		req.UpdatedAt = updatedAt.UTC().Format("2006-01-02T15:04:05Z")

		req.FolderShareKey = folderShareKey
		req.FolderPath = folderPath

		if tagsJSON.Valid {
			if err := json.Unmarshal([]byte(tagsJSON.String), &req.Tags); err != nil {
				log.Printf("requests: failed to unmarshal tags for id=%d url=%s: %v", req.ID, req.SubmittedURL, err)
				req.Tags = []Tag{}
			}
		} else {
			req.Tags = []Tag{}
		}

		switch req.Status {
		case "requested":
			result.Requested = append(result.Requested, req)
		case "downloading":
			result.Downloading = append(result.Downloading, req)
		case "indexing":
			result.Indexing = append(result.Indexing, req)
		case "added":
			result.Added = append(result.Added, req)
		case "rejected":
			result.Rejected = append(result.Rejected, req)
		}
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return result, nil
}

func (s *RequestsService) Create(title, submittedURL, sourceKey string, tags []Tag, status *string) (*SourceRequest, error) {
	tagsJSON, err := json.Marshal(tags)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC().Format("2006-01-02T15:04:05Z")

	initialStatus := "requested"
	if status != nil {
		initialStatus = *status
	}

	var id int64
	err = s.db.DB().QueryRow(`
		INSERT INTO source_requests (submitted_url, source_key, title, tags, status, created_at, updated_at, collection_id)
        VALUES ($1, NULLIF($2, ''), $3, $4, $5, $6, $7,
        (SELECT MIN(k.collection_id) FROM collection_keys k
         JOIN collections c ON c.id=k.collection_id JOIN folders f ON f.path=c.path
         WHERE k.key=$2 OR k.key='url:' || RTRIM($1,'/') HAVING COUNT(DISTINCT k.collection_id)=1))
		ON CONFLICT DO NOTHING
		RETURNING id
	`, submittedURL, sourceKey, title, string(tagsJSON), initialStatus, now, now).Scan(&id)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &SourceRequest{
		ID:           id,
		SubmittedURL: submittedURL,
		SourceKey:    sourceKey,
		Title:        title,
		Status:       initialStatus,
		Tags:         tags,
		CreatedAt:    now,
		UpdatedAt:    now,
	}, nil
}

func (s *RequestsService) FindExistingSource(sourceKey, canonicalURL string) (*ExistingSourceRequest, error) {
	var existing ExistingSourceRequest
	err := s.db.DB().QueryRow(`
		SELECT sr.id, sr.submitted_url, sr.title, sr.status, f.path
		FROM source_requests sr
		LEFT JOIN collections c ON c.id=sr.collection_id
		LEFT JOIN folders f ON f.path=c.path
		WHERE sr.source_key = $1
			OR RTRIM(sr.submitted_url, '/') = RTRIM($2, '/')
		ORDER BY CASE WHEN sr.source_key = $1 THEN 0 ELSE 1 END
		LIMIT 1
	`, sourceKey, canonicalURL).Scan(
		&existing.ID,
		&existing.SubmittedURL,
		&existing.Title,
		&existing.Status,
		&existing.FolderPath,
	)
	if err == sql.ErrNoRows {
		err = s.db.DB().QueryRow(`SELECT 0, c.channel_url, c.name, 'added', f.path
        FROM collection_keys k JOIN collections c ON c.id=k.collection_id
        JOIN folders f ON f.path=c.path
        WHERE k.key=$1 OR k.key='url:' || RTRIM($2,'/')
        ORDER BY c.path LIMIT 1`, sourceKey, canonicalURL).Scan(&existing.ID, &existing.SubmittedURL, &existing.Title, &existing.Status, &existing.FolderPath)
		if err == sql.ErrNoRows {
			return nil, nil
		}
	}
	if err != nil {
		return nil, err
	}
	return &existing, nil
}

func (s *RequestsService) UpdateStatus(id int64, status string) error {
	now := time.Now().UTC().Format("2006-01-02T15:04:05Z")

	result, err := s.db.DB().Exec(`
		UPDATE source_requests
		SET status = $1, updated_at = $2
		WHERE id = $3
	`, status, now, id)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *RequestsService) Update(id int64, title string, tags []Tag) error {
	tagsJSON, err := json.Marshal(tags)
	if err != nil {
		return err
	}

	now := time.Now().UTC().Format("2006-01-02T15:04:05Z")

	result, err := s.db.DB().Exec(`
		UPDATE source_requests
		SET title = $1, tags = $2, updated_at = $3
		WHERE id = $4
	`, title, string(tagsJSON), now, id)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *RequestsService) Delete(id int64) error {
	result, err := s.db.DB().Exec(`DELETE FROM source_requests WHERE id = $1`, id)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}
