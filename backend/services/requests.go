package services

import (
	"encoding/json"
	"time"
)

type Tag struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

type SourceRequest struct {
	ID             int64   `json:"id"`
	SubmittedURL   string  `json:"submittedUrl"`
	CanonicalID    *string `json:"canonicalId,omitempty"`
	Title          string  `json:"title"`
	ImageURL       *string `json:"imageUrl,omitempty"`
	Status         string  `json:"status"`
	Tags           []Tag   `json:"tags"`
	FolderShareKey *string `json:"folderShareKey,omitempty"`
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

func NewRequestsService(db *Database) *RequestsService {
	return &RequestsService{db: db}
}

func (s *RequestsService) GetAllGroupedByStatus() (*RequestsByStatus, error) {
	rows, err := s.db.DB().Query(`
		SELECT id, submitted_url, canonical_id, title, image_url, status, tags, folder_share_key, created_at, updated_at
		FROM source_requests
		ORDER BY created_at DESC
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
		var canonicalID, imageURL, folderShareKey *string
		var tagsJSON string

		if err := rows.Scan(
			&req.ID, &req.SubmittedURL, &canonicalID, &req.Title, &imageURL,
			&req.Status, &tagsJSON, &folderShareKey, &req.CreatedAt, &req.UpdatedAt,
		); err != nil {
			return nil, err
		}

		req.CanonicalID = canonicalID
		req.ImageURL = imageURL
		req.FolderShareKey = folderShareKey

		if err := json.Unmarshal([]byte(tagsJSON), &req.Tags); err != nil {
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

	return result, nil
}

func (s *RequestsService) Create(title, submittedURL string, imageURL *string, tags []Tag) (*SourceRequest, error) {
	tagsJSON, err := json.Marshal(tags)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC().Format("2006-01-02T15:04:05Z")

	result, err := s.db.DB().Exec(`
		INSERT INTO source_requests (submitted_url, title, image_url, tags, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`, submittedURL, title, imageURL, string(tagsJSON), now, now)
	if err != nil {
		return nil, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}

	return &SourceRequest{
		ID:           id,
		SubmittedURL: submittedURL,
		Title:        title,
		ImageURL:     imageURL,
		Status:       "requested",
		Tags:         tags,
		CreatedAt:    now,
		UpdatedAt:    now,
	}, nil
}

func (s *RequestsService) UpdateStatus(id int64, status string, folderShareKey *string) error {
	now := time.Now().UTC().Format("2006-01-02T15:04:05Z")

	_, err := s.db.DB().Exec(`
		UPDATE source_requests
		SET status = ?, folder_share_key = ?, updated_at = ?
		WHERE id = ?
	`, status, folderShareKey, now, id)
	return err
}

func (s *RequestsService) Update(id int64, title string, imageURL *string, tags []Tag) error {
	tagsJSON, err := json.Marshal(tags)
	if err != nil {
		return err
	}

	now := time.Now().UTC().Format("2006-01-02T15:04:05Z")

	_, err = s.db.DB().Exec(`
		UPDATE source_requests
		SET title = ?, image_url = ?, tags = ?, updated_at = ?
		WHERE id = ?
	`, title, imageURL, string(tagsJSON), now, id)
	return err
}

func (s *RequestsService) Delete(id int64) error {
	_, err := s.db.DB().Exec(`DELETE FROM source_requests WHERE id = ?`, id)
	return err
}
