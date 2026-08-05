package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"github.com/onion/audio-share-backend/services"
)

type shareNotifier interface {
	IsConfigured() bool
	SendShareNotification(requestURL string, hasHigherRemovalRisk bool) error
}

type sourceRequestLookup interface {
	FindExistingSource(sourceKey, canonicalURL string) (*services.ExistingSourceRequest, error)
}

type ShareHandler struct {
	ntfy       shareNotifier
	requests   sourceRequestLookup
	normalizer services.SourceNormalizer
}

func NewShareHandler(
	ntfy shareNotifier,
	requests sourceRequestLookup,
	normalizer services.SourceNormalizer,
) *ShareHandler {
	return &ShareHandler{ntfy: ntfy, requests: requests, normalizer: normalizer}
}

type shareRequest struct {
	RequestURL           string `json:"requestUrl"`
	HasHigherRemovalRisk bool   `json:"hasHigherRemovalRisk"`
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

	req.RequestURL = strings.TrimSpace(req.RequestURL)
	if req.RequestURL == "" || len(req.RequestURL) > maxURLLen {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid URL"})
		return
	}

	if h.normalizer == nil || !h.normalizer.IsConfigured() {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Server configuration error"})
		return
	}

	if !h.ntfy.IsConfigured() {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Server configuration error"})
		return
	}

	normalized, err := h.normalizer.Normalize(r.Context(), req.RequestURL)
	if err != nil {
		var normalizationError *services.SourceNormalizationError
		if errors.As(err, &normalizationError) {
			switch normalizationError.Code {
			case "invalid_url", "invalid_input", "unsupported_platform", "unresolved_source":
				writeJSON(w, http.StatusUnprocessableEntity, map[string]string{
					"code":  normalizationError.Code,
					"error": normalizationError.Message,
				})
				return
			case "timeout":
				writeJSON(w, http.StatusGatewayTimeout, map[string]string{"error": normalizationError.Message})
				return
			}
		}
		log.Printf("share: failed to normalize source: %v", err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "Could not verify this source. Please try again."})
		return
	}

	existing, err := h.requests.FindExistingSource(normalized.SourceKey, normalized.CanonicalURL)
	if err != nil {
		log.Printf("share: failed to check existing source: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to check existing requests"})
		return
	}
	if existing != nil {
		writeJSON(w, http.StatusConflict, map[string]interface{}{
			"code":     "source_exists",
			"error":    duplicateSourceMessage(existing.Status),
			"existing": existing,
		})
		return
	}

	if err := h.ntfy.SendShareNotification(normalized.CanonicalURL, req.HasHigherRemovalRisk); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to send notification"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func duplicateSourceMessage(status string) string {
	switch status {
	case "added":
		return "This source is already in the archive."
	case "rejected":
		return "This source was already reviewed and rejected."
	default:
		return "This source has already been requested."
	}
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}
