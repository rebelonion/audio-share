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

// NullableString distinguishes between a field being omitted (Set=false)
// and explicitly set to null (Set=true, Value=nil) in JSON.
type NullableString struct {
	Value *string
	Set   bool
}

func (n *NullableString) UnmarshalJSON(data []byte) error {
	n.Set = true
	if string(data) == "null" {
		n.Value = nil
		return nil
	}
	var s string
	if err := json.Unmarshal(data, &s); err != nil {
		return err
	}
	n.Value = &s
	return nil
}

type RequestsService struct {
	db *Database
}

func NewRequestsService(db *Database) *RequestsService {
	return &RequestsService{db: db}
}

func (s *RequestsService) GetAllGroupedByStatus() (*RequestsByStatus, error) {
	rows, err := s.db.DB().Query(`
		SELECT sr.id, sr.submitted_url, sr.title, sr.status, sr.tags, sr.folder_share_key, f.path, sr.created_at, sr.updated_at
		FROM source_requests sr
		LEFT JOIN folders f ON f.share_key = sr.folder_share_key
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

		if err := rows.Scan(
			&req.ID, &req.SubmittedURL, &req.Title,
			&req.Status, &tagsJSON, &folderShareKey, &folderPath, &req.CreatedAt, &req.UpdatedAt,
		); err != nil {
			return nil, err
		}

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

func (s *RequestsService) Create(title, submittedURL string, tags []Tag, status *string) (*SourceRequest, error) {
	tagsJSON, err := json.Marshal(tags)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC().Format("2006-01-02T15:04:05Z")

	initialStatus := "requested"
	if status != nil {
		initialStatus = *status
	}

	result, err := s.db.DB().Exec(`
		INSERT OR IGNORE INTO source_requests (submitted_url, title, tags, status, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`, submittedURL, title, string(tagsJSON), initialStatus, now, now)
	if err != nil {
		return nil, err
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return nil, err
	}
	if affected == 0 {
		return nil, nil
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}

	return &SourceRequest{
		ID:           id,
		SubmittedURL: submittedURL,
		Title:        title,
		Status:       initialStatus,
		Tags:         tags,
		CreatedAt:    now,
		UpdatedAt:    now,
	}, nil
}

func (s *RequestsService) UpdateStatus(id int64, status string, folderShareKey NullableString) error {
	now := time.Now().UTC().Format("2006-01-02T15:04:05Z")

	var result sql.Result
	var err error

	if folderShareKey.Set {
		result, err = s.db.DB().Exec(`
			UPDATE source_requests
			SET status = ?, folder_share_key = ?, updated_at = ?
			WHERE id = ?
		`, status, folderShareKey.Value, now, id)
	} else {
		result, err = s.db.DB().Exec(`
			UPDATE source_requests
			SET status = ?, updated_at = ?
			WHERE id = ?
		`, status, now, id)
	}
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
		SET title = ?, tags = ?, updated_at = ?
		WHERE id = ?
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
	result, err := s.db.DB().Exec(`DELETE FROM source_requests WHERE id = ?`, id)
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
