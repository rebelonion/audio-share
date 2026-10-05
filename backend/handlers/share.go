package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/onion/audio-share-backend/services"
)

type shareNotifier interface {
	IsConfigured() bool
	SendShareNotification(notification services.ShareNotification) error
}

type shareSubmissionLog interface {
	Count(ctx context.Context, sessionID string) (int, error)
	Record(ctx context.Context, sessionID, submittedURL, sourceKey string) error
	HasRecentSource(ctx context.Context, sourceKey string, since time.Time) (bool, error)
}

// pendingSubmissionWindow is how long an unreviewed submission blocks
// duplicates. Sources skipped without logging a request become requestable again.
const pendingSubmissionWindow = 7 * 24 * time.Hour

type sourceRequestLookup interface {
	FindExistingSource(sourceKey, canonicalURL string) (*services.ExistingSourceRequest, error)
}

type ShareHandler struct {
	ntfy          shareNotifier
	requests      sourceRequestLookup
	normalizer    services.SourceNormalizer
	submissions   shareSubmissionLog
	sessionSecret []byte
}

func NewShareHandler(
	ntfy shareNotifier,
	requests sourceRequestLookup,
	normalizer services.SourceNormalizer,
	submissions shareSubmissionLog,
	sessionSecret string,
) *ShareHandler {
	return &ShareHandler{
		ntfy:          ntfy,
		requests:      requests,
		normalizer:    normalizer,
		submissions:   submissions,
		sessionSecret: []byte(sessionSecret),
	}
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
	requestID := strings.TrimSpace(r.Header.Get("X-Request-ID"))
	if len(requestID) > 100 {
		requestID = requestID[:100]
	}
	if requestID != "" {
		log.Printf("share: request_id=%q received", requestID)
	}

	r.Body = http.MaxBytesReader(w, r.Body, 16*1024)
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

	if !h.ntfy.IsConfigured() {
		services.AddErrorContext(r.Context(), services.ErrorContext{Step: "configure", Message: "Notification service is not configured"})
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Server configuration error"})
		return
	}

	notification := services.ShareNotification{
		RequestURL:        req.RequestURL,
		HigherRemovalRisk: req.HasHigherRemovalRisk,
	}
	sourceKey := ""
	if h.normalizer == nil || !h.normalizer.IsConfigured() {
		log.Printf("share: source normalizer is not configured; sending unnormalized request")
		notification.NormalizationFailed = true
	} else if normalized, err := h.normalizer.Normalize(r.Context(), req.RequestURL); err != nil {
		services.AddErrorContext(r.Context(), services.ErrorDetails(err))
		var normalizationError *services.SourceNormalizationError
		code := ""
		if errors.As(err, &normalizationError) {
			code = normalizationError.Code
		}
		switch code {
		case "invalid_url", "invalid_input":
			writeJSON(w, http.StatusUnprocessableEntity, map[string]string{
				"code":  normalizationError.Code,
				"error": normalizationError.Message,
			})
			return
		case "unsupported_platform":
			// Still delivered so unsupported platforms people ask for stay visible.
			notification.UnsupportedPlatform = true
		default:
			log.Printf("share: failed to normalize source; sending unnormalized request: %v", err)
			services.AnnotateError(r.Context(), "normalize", "unavailable", "degraded")
			notification.NormalizationFailed = true
		}
	} else {
		notification.RequestURL = normalized.CanonicalURL
		sourceKey = normalized.SourceKey
	}
	if sourceKey == "" {
		sourceKey = roughSourceKey(req.RequestURL)
	}

	if sourceKey != "" {
		existing, err := h.requests.FindExistingSource(sourceKey, notification.RequestURL)
		if err != nil {
			services.AddErrorContext(r.Context(), services.ErrorDetails(err))
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

		pending, err := h.submissions.HasRecentSource(r.Context(), sourceKey, time.Now().Add(-pendingSubmissionWindow))
		if err != nil {
			log.Printf("share: failed to check pending submissions; continuing: %v", err)
		} else if pending {
			writeJSON(w, http.StatusConflict, map[string]string{
				"code":  "source_pending",
				"error": "This source was recently requested and is awaiting review.",
			})
			return
		}
	}

	sessionID, ok := resolveSessionID(r, h.sessionSecret)
	if !ok {
		sessionID = generateSessionID()
	}
	setSessionCookie(w, r, h.sessionSecret, sessionID)

	notification.SessionID = sessionID
	if previous, err := h.submissions.Count(r.Context(), sessionID); err != nil {
		log.Printf("share: failed to count submissions for session=%s: %v", sessionID, err)
	} else {
		notification.SessionSubmissions = previous + 1
	}

	if err := h.ntfy.SendShareNotification(notification); err != nil {
		services.AddErrorContext(r.Context(), services.ErrorDetails(err))
		services.AnnotateError(r.Context(), "deliver", "unavailable", "blocked")
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to send notification"})
		return
	}
	if err := h.submissions.Record(r.Context(), sessionID, notification.RequestURL, sourceKey); err != nil {
		log.Printf("share: failed to record submission for session=%s: %v", sessionID, err)
	}
	if requestID != "" {
		log.Printf("share: request_id=%q completed", requestID)
	}

	response := map[string]interface{}{"success": true}
	if notification.UnsupportedPlatform {
		response["code"] = "unsupported_platform"
		response["warning"] = "This platform isn't supported yet, so the request may not be added."
	}
	writeJSON(w, http.StatusOK, response)
}

// roughSourceKey identifies sources the normalizer couldn't, using the
// lowercased host and path, so repeat requests can still be deduplicated.
func roughSourceKey(rawURL string) string {
	if !strings.Contains(rawURL, "://") {
		rawURL = "https://" + rawURL
	}
	u, err := url.Parse(rawURL)
	if err != nil || u.Hostname() == "" {
		return ""
	}
	host := strings.ToLower(u.Hostname())
	host = strings.TrimPrefix(strings.TrimPrefix(host, "www."), "m.")
	return "url:" + host + strings.ToLower(strings.TrimRight(u.EscapedPath(), "/"))
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
