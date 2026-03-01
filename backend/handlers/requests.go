package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/onion/audio-share-backend/services"
)

type RequestsHandler struct {
	service *services.RequestsService
}

func NewRequestsHandler(service *services.RequestsService) *RequestsHandler {
	return &RequestsHandler{service: service}
}

type createRequestBody struct {
	Title        string         `json:"title"`
	SubmittedURL string         `json:"submittedUrl"`
	ImageURL     *string        `json:"imageUrl,omitempty"`
	Tags         []services.Tag `json:"tags"`
}

type updateStatusBody struct {
	Status         string  `json:"status"`
	FolderShareKey *string `json:"folderShareKey,omitempty"`
}

type updateRequestBody struct {
	Title    string         `json:"title"`
	ImageURL *string        `json:"imageUrl,omitempty"`
	Tags     []services.Tag `json:"tags"`
}

func (h *RequestsHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/requests")
	path = strings.TrimPrefix(path, "/")

	switch {
	case path == "" && r.Method == http.MethodGet:
		h.handleList(w, r)
	case path == "" && r.Method == http.MethodPost:
		h.handleCreate(w, r)
	case strings.HasSuffix(path, "/status") && r.Method == http.MethodPatch:
		idStr := strings.TrimSuffix(path, "/status")
		h.handleUpdateStatus(w, r, idStr)
	case path != "" && r.Method == http.MethodPatch:
		h.handleUpdate(w, r, path)
	case path != "" && r.Method == http.MethodDelete:
		h.handleDelete(w, r, path)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *RequestsHandler) handleList(w http.ResponseWriter, r *http.Request) {
	result, err := h.service.GetAllGroupedByStatus()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch requests"})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *RequestsHandler) handleCreate(w http.ResponseWriter, r *http.Request) {
	var body createRequestBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if body.Title == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Title is required"})
		return
	}

	if body.SubmittedURL == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Submitted URL is required"})
		return
	}

	if body.Tags == nil {
		body.Tags = []services.Tag{}
	}

	request, err := h.service.Create(body.Title, body.SubmittedURL, body.ImageURL, body.Tags)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create request"})
		return
	}

	writeJSON(w, http.StatusCreated, request)
}

func (h *RequestsHandler) handleUpdateStatus(w http.ResponseWriter, r *http.Request, idStr string) {
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

	validStatuses := map[string]bool{
		"requested":   true,
		"downloading": true,
		"indexing":    true,
		"added":       true,
		"rejected":    true,
	}

	if !validStatuses[body.Status] {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid status"})
		return
	}

	if err := h.service.UpdateStatus(id, body.Status, body.FolderShareKey); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update status"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *RequestsHandler) handleUpdate(w http.ResponseWriter, r *http.Request, idStr string) {
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

	if body.Tags == nil {
		body.Tags = []services.Tag{}
	}

	if err := h.service.Update(id, body.Title, body.ImageURL, body.Tags); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update request"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *RequestsHandler) handleDelete(w http.ResponseWriter, r *http.Request, idStr string) {
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request ID"})
		return
	}

	if err := h.service.Delete(id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete request"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}
