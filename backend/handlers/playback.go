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
}

func NewPlaybackHandler(playbackService *services.PlaybackService, sessionSecret string) *PlaybackHandler {
	return &PlaybackHandler{
		playbackService: playbackService,
		sessionSecret:   []byte(sessionSecret),
	}
}

type recordRequest struct {
	ShareKey string `json:"shareKey"`
}

func (h *PlaybackHandler) RecordHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req recordRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
			return
		}

		if req.ShareKey == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "shareKey is required"})
			return
		}

		sessionID, ok := resolveSessionID(r, h.sessionSecret)
		if !ok {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "Invalid session"})
			return
		}
		setSessionCookie(w, r, h.sessionSecret, sessionID)

		if err := h.playbackService.RecordPlayEvent(req.ShareKey, sessionID); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to record play event"})
			return
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "sessionId": sessionID})
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
