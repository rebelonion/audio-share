package handlers

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"

	"github.com/onion/audio-share-backend/services"
)

type ContactHandler struct {
	ntfy *services.NtfyService
}

func NewContactHandler(ntfy *services.NtfyService) *ContactHandler {
	return &ContactHandler{ntfy: ntfy}
}

type contactRequest struct {
	Topic   string `json:"topic"`
	Email   string `json:"email"`
	Message string `json:"message"`
}

var emailRegex = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

func (h *ContactHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req contactRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if req.Topic == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Topic is required"})
		return
	}

	if strings.TrimSpace(req.Message) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Message is required"})
		return
	}

	if req.Email != "" && !emailRegex.MatchString(req.Email) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Please enter a valid email address"})
		return
	}

	if !h.ntfy.IsConfigured() {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Server configuration error"})
		return
	}

	if err := h.ntfy.SendContactNotification(req.Topic, req.Email, req.Message); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to send notification"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}
