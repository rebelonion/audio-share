package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/onion/audio-share-backend/services"
)

var validRequestStatuses = map[string]bool{
	"requested":   true,
	"downloading": true,
	"indexing":    true,
	"added":       true,
	"rejected":    true,
}

func isValidRequestStatus(s string) bool {
	return validRequestStatuses[s]
}

type RequestsHandler struct {
	service *services.RequestsService
}

func NewRequestsHandler(service *services.RequestsService) *RequestsHandler {
	return &RequestsHandler{service: service}
}

type createRequestBody struct {
	Title        string         `json:"title"`
	SubmittedURL string         `json:"submittedUrl"`
	Tags         []services.Tag `json:"tags"`
	Status       *string        `json:"status,omitempty"`
}

type updateStatusBody struct {
	Status         string                  `json:"status"`
	FolderShareKey services.NullableString `json:"folderShareKey"`
}

type updateRequestBody struct {
	Title string         `json:"title"`
	Tags  []services.Tag `json:"tags"`
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
		log.Printf("requests: failed to fetch: %v", err)
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

	if _, err := url.ParseRequestURI(body.SubmittedURL); err != nil {
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

	request, err := h.service.Create(body.Title, body.SubmittedURL, body.Tags, body.Status)
	if err != nil {
		log.Printf("requests: failed to create: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create request"})
		return
	}
	if request == nil {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "A request for this URL already exists"})
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

	if !isValidRequestStatus(body.Status) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid status"})
		return
	}

	if err := h.service.UpdateStatus(id, body.Status, body.FolderShareKey); err != nil {
		log.Printf("requests: failed to update status for id=%d: %v", id, err)
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

	if body.Title == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Title is required"})
		return
	}

	if body.Tags == nil {
		body.Tags = []services.Tag{}
	}

	if err := h.service.Update(id, body.Title, body.Tags); err != nil {
		log.Printf("requests: failed to update id=%d: %v", id, err)
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
		log.Printf("requests: failed to delete id=%d: %v", id, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete request"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}
