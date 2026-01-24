package handlers

import (
	"encoding/json"
	"net/http"
	"net/url"

	"github.com/onion/audio-share-backend/services"
)

type ShareHandler struct {
	ntfy *services.NtfyService
}

func NewShareHandler(ntfy *services.NtfyService) *ShareHandler {
	return &ShareHandler{ntfy: ntfy}
}

type shareRequest struct {
	RequestURL string `json:"requestUrl"`
}

func (h *ShareHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req shareRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if req.RequestURL == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid URL"})
		return
	}

	if _, err := url.ParseRequestURI(req.RequestURL); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Please enter a valid URL"})
		return
	}

	if !h.ntfy.IsConfigured() {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Server configuration error"})
		return
	}

	if err := h.ntfy.SendShareNotification(req.RequestURL); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to send notification"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}
