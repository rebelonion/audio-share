package handlers

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
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

const sessionCookieName = "audio_session_id"
const sessionCookieMaxAge = 365 * 24 * 60 * 60

func generateSessionID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "fallback"
	}
	return hex.EncodeToString(b)
}

func (h *PlaybackHandler) signSessionID(id string) string {
	mac := hmac.New(sha256.New, h.sessionSecret)
	mac.Write([]byte(id))
	return id + "." + hex.EncodeToString(mac.Sum(nil))
}

func (h *PlaybackHandler) verifySessionCookie(signed string) (string, bool) {
	dot := strings.LastIndex(signed, ".")
	if dot < 0 {
		return "", false
	}
	id, sig := signed[:dot], signed[dot+1:]
	mac := hmac.New(sha256.New, h.sessionSecret)
	mac.Write([]byte(id))
	expected := hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(sig), []byte(expected)) {
		return "", false
	}
	return id, true
}

// resolveSessionID returns (sessionID, ok).
// ok is false only when a cookie is present but the signature is invalid.
func (h *PlaybackHandler) resolveSessionID(r *http.Request) (string, bool) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil || cookie.Value == "" {
		return generateSessionID(), true
	}
	id, ok := h.verifySessionCookie(cookie.Value)
	return id, ok
}

func (h *PlaybackHandler) setSessionCookie(w http.ResponseWriter, sessionID string) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    h.signSessionID(sessionID),
		MaxAge:   sessionCookieMaxAge,
		Path:     "/",
		SameSite: http.SameSiteLaxMode,
	})
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

		sessionID, ok := h.resolveSessionID(r)
		if !ok {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "Invalid session"})
			return
		}
		h.setSessionCookie(w, sessionID)

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
