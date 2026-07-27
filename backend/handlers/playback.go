package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/onion/audio-share-backend/services"
)

type PlaybackHandler struct {
	playbackService *services.PlaybackService
	sessionSecret   []byte
	accessKeys      *services.AccessKeyManager
}

func NewPlaybackHandler(
	playbackService *services.PlaybackService,
	sessionSecret string,
	accessKeys *services.AccessKeyManager,
) *PlaybackHandler {
	return &PlaybackHandler{
		playbackService: playbackService,
		sessionSecret:   []byte(sessionSecret),
		accessKeys:      accessKeys,
	}
}

type recordRequest struct {
	ShareKey           string `json:"shareKey"`
	ListeningSessionID string `json:"listeningSessionId"`
	Origin             string `json:"origin"`
	AccessKey          string `json:"accessKey"`
}

func (h *PlaybackHandler) RecordHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, 4096)
		var req recordRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
			return
		}

		req.ShareKey = strings.TrimSpace(req.ShareKey)
		req.ListeningSessionID = strings.TrimSpace(req.ListeningSessionID)
		if req.ShareKey == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "shareKey is required"})
			return
		}
		if len(req.ShareKey) > 128 || len(req.ListeningSessionID) > 128 || len(req.AccessKey) > 4096 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid playback identifiers"})
			return
		}
		req.Origin = normalizePlaybackOrigin(req.Origin)

		sessionID, ok := currentSessionID(r, h.sessionSecret)
		if !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Invalid session"})
			return
		}
		if h.accessKeys == nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Playback authorization unavailable"})
			return
		}
		verifiedAccess, err := h.accessKeys.VerifyAndExtract(
			req.AccessKey,
			sessionID,
			req.ShareKey,
			services.MediaPurposeStream,
		)
		if err != nil {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "Invalid access key"})
			return
		}

		if err := h.playbackService.RecordPlayEvent(
			req.ShareKey,
			sessionID,
			req.ListeningSessionID,
			req.Origin,
			verifiedAccess.Nonce,
			verifiedAccess.ExpiresAt,
		); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to record play event"})
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"sessionId": sessionID})
	}
}

func normalizePlaybackOrigin(origin string) string {
	origin = strings.TrimSpace(origin)
	switch origin {
	case "browse", "share", "home", "search", "likes", "manual", "autoplay":
		return origin
	default:
		return "unknown"
	}
}

func (h *PlaybackHandler) RecentHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		tracks, err := h.playbackService.GetRecentlyPlayed(30)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch recent tracks"})
			return
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{"tracks": tracks})
	}
}

func (h *PlaybackHandler) PopularHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		tracks, err := h.playbackService.GetPopularTracks(30)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch popular tracks"})
			return
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{"tracks": tracks})
	}
}

func (h *PlaybackHandler) NewHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		tracks, err := h.playbackService.GetRecentlyAdded(30)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch new tracks"})
			return
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{"tracks": tracks})
	}
}

func (h *PlaybackHandler) UnavailableHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		tracks, err := h.playbackService.GetRecentlyUnavailable(10)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch unavailable tracks"})
			return
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{"tracks": tracks})
	}
}

func (h *PlaybackHandler) RecommendationsHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Extract key from /api/playback/recommendations/{key}
		key := strings.TrimPrefix(r.URL.Path, "/api/playback/recommendations/")
		if key == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "key is required"})
			return
		}

		tracks, err := h.playbackService.GetRecommendations(key, 30)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch recommendations"})
			return
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{"tracks": tracks})
	}
}
