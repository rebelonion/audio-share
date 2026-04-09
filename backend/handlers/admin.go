package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/onion/audio-share-backend/services"
)

type AdminHandler struct {
	db       *sql.DB
	requests *services.RequestsService
}

func NewAdminHandler(db *sql.DB, requests *services.RequestsService) *AdminHandler {
	return &AdminHandler{db: db, requests: requests}
}

func (h *AdminHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/admin/")
	path = strings.Trim(path, "/")

	switch {
	// Audio
	case path == "audio/sources" && r.Method == http.MethodGet:
		h.handleAudioSources(w, r)
	case strings.HasPrefix(path, "audio/") && strings.HasSuffix(path, "/unavailable") && r.Method == http.MethodPatch:
		key := strings.TrimPrefix(path, "audio/")
		key = strings.TrimSuffix(key, "/unavailable")
		h.handleAudioUnavailable(w, r, key)

	// Requests
	case path == "requests" && r.Method == http.MethodPost:
		h.handleRequestCreate(w, r)
	case strings.HasSuffix(path, "/status") && r.Method == http.MethodPatch:
		idStr := strings.TrimPrefix(strings.TrimSuffix(path, "/status"), "requests/")
		h.handleRequestUpdateStatus(w, r, idStr)
	case strings.HasPrefix(path, "requests/") && r.Method == http.MethodPatch:
		idStr := strings.TrimPrefix(path, "requests/")
		h.handleRequestUpdate(w, r, idStr)
	case strings.HasPrefix(path, "requests/") && r.Method == http.MethodDelete:
		idStr := strings.TrimPrefix(path, "requests/")
		h.handleRequestDelete(w, r, idStr)

	default:
		http.Error(w, "Not found", http.StatusNotFound)
	}
}

// Audio handlers

type audioSourceItem struct {
	ShareKey      string  `json:"shareKey"`
	WebpageURL    string  `json:"webpageUrl"`
	Title         string  `json:"title,omitempty"`
	Filename      string  `json:"filename"`
	UnavailableAt *string `json:"unavailableAt"`
}

func (h *AdminHandler) handleAudioSources(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(`
		SELECT share_key, webpage_url, COALESCE(title, ''), filename, unavailable_at
		FROM audio_files
		WHERE deleted = 0 AND webpage_url IS NOT NULL AND webpage_url != ''
		ORDER BY indexed_at DESC
	`)
	if err != nil {
		log.Printf("admin: audio sources query failed: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Server error"})
		return
	}
	defer rows.Close()

	items := []audioSourceItem{}
	for rows.Next() {
		var item audioSourceItem
		var unavailableAt sql.NullTime
		if err := rows.Scan(&item.ShareKey, &item.WebpageURL, &item.Title, &item.Filename, &unavailableAt); err != nil {
			log.Printf("admin: audio sources scan failed: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Server error"})
			return
		}
		if unavailableAt.Valid {
			s := unavailableAt.Time.UTC().Format(time.RFC3339)
			item.UnavailableAt = &s
		}
		items = append(items, item)
	}

	writeJSON(w, http.StatusOK, items)
}

func (h *AdminHandler) handleAudioUnavailable(w http.ResponseWriter, r *http.Request, key string) {
	if key == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Key required"})
		return
	}

	var body struct {
		Unavailable bool `json:"unavailable"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	var unavailableAt interface{}
	if body.Unavailable {
		unavailableAt = time.Now().UTC()
	}
	result, err := h.db.Exec(`
		UPDATE audio_files SET unavailable_at = $1 WHERE share_key = $2 AND deleted = 0
	`, unavailableAt, key)
	if err != nil {
		log.Printf("admin: set unavailable failed for key=%s: %v", key, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Server error"})
		return
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Not found"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// Requests handlers

func (h *AdminHandler) handleRequestCreate(w http.ResponseWriter, r *http.Request) {
	var body createRequestBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if body.Title == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Title is required"})
		return
	}
	if len(body.Title) > maxTitleLen {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Title is too long"})
		return
	}
	if body.SubmittedURL == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Submitted URL is required"})
		return
	}
	if len(body.SubmittedURL) > maxURLLen {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "URL is too long"})
		return
	}
	if u, err := url.ParseRequestURI(body.SubmittedURL); err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Please enter a valid URL"})
		return
	}
	if body.Tags == nil {
		body.Tags = []services.Tag{}
	}
	if body.Status != nil && !isValidRequestStatus(*body.Status) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid status"})
		return
	}

	request, err := h.requests.Create(body.Title, body.SubmittedURL, body.Tags, body.Status)
	if err != nil {
		log.Printf("admin: failed to create request: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create request"})
		return
	}
	if request == nil {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "A request for this URL already exists"})
		return
	}

	writeJSON(w, http.StatusCreated, request)
}

func (h *AdminHandler) handleRequestUpdateStatus(w http.ResponseWriter, r *http.Request, idStr string) {
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request ID"})
		return
	}

	var body updateStatusBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}
	if !isValidRequestStatus(body.Status) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid status"})
		return
	}

	if err := h.requests.UpdateStatus(id, body.Status, body.FolderShareKey); err != nil {
		if errors.Is(err, services.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "Request not found"})
			return
		}
		log.Printf("admin: failed to update status for id=%d: %v", id, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update status"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *AdminHandler) handleRequestUpdate(w http.ResponseWriter, r *http.Request, idStr string) {
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request ID"})
		return
	}

	var body updateRequestBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}
	if body.Title == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Title is required"})
		return
	}
	if len(body.Title) > maxTitleLen {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Title is too long"})
		return
	}
	if body.Tags == nil {
		body.Tags = []services.Tag{}
	}

	if err := h.requests.Update(id, body.Title, body.Tags); err != nil {
		if errors.Is(err, services.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "Request not found"})
			return
		}
		log.Printf("admin: failed to update id=%d: %v", id, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update request"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *AdminHandler) handleRequestDelete(w http.ResponseWriter, r *http.Request, idStr string) {
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request ID"})
		return
	}

	if err := h.requests.Delete(id); err != nil {
		if errors.Is(err, services.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "Request not found"})
			return
		}
		log.Printf("admin: failed to delete id=%d: %v", id, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete request"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}
