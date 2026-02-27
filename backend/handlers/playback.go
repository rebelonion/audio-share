package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/onion/audio-share-backend/services"
)

type PlaybackHandler struct {
	playbackService *services.PlaybackService
}

func NewPlaybackHandler(playbackService *services.PlaybackService) *PlaybackHandler {
	return &PlaybackHandler{playbackService: playbackService}
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

		if err := h.playbackService.RecordPlayEvent(req.ShareKey); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to record play event"})
			return
		}

		writeJSON(w, http.StatusOK, map[string]bool{"success": true})
	}
}

func (h *PlaybackHandler) RecentHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		tracks, err := h.playbackService.GetRecentlyPlayed(10)
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

		tracks, err := h.playbackService.GetPopularTracks(10)
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

		tracks, err := h.playbackService.GetRecentlyAdded(10)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch new tracks"})
			return
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{"tracks": tracks})
	}
}
