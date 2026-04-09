package handlers

import (
	"log"
	"net/http"

	"github.com/onion/audio-share-backend/services"
)

const (
	maxTitleLen = 500
	maxURLLen   = 2048
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

// createRequestBody, updateStatusBody, updateRequestBody are used by AdminHandler too.
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


type RequestsHandler struct {
	service *services.RequestsService
}

func NewRequestsHandler(service *services.RequestsService) *RequestsHandler {
	return &RequestsHandler{service: service}
}

func (h *RequestsHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	h.handleList(w, r)
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
