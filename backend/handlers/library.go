package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/onion/audio-share-backend/services"
)

type libraryService interface {
	EnsureProfile(string) error
	RotateRecoveryKey(string) (string, error)
	RecoverProfile(string) (string, error)
	LikedTrackKeys(string) ([]string, error)
	LikedTracks(string) ([]services.LibraryTrack, error)
	ProfileHasRecoveryKey(string) (bool, error)
	Like(string, string) error
	Unlike(string, string) error
}

type LibraryHandler struct {
	library       libraryService
	sessionSecret []byte
}

type recoverProfileResponse struct {
	ProfileID string `json:"profileId"`
}

type likesResponse struct {
	ProfileID      string   `json:"profileId"`
	HasRecoveryKey bool     `json:"hasRecoveryKey"`
	ShareKeys      []string `json:"shareKeys"`
}

type likedTracksResponse struct {
	Tracks []services.LibraryTrack `json:"tracks"`
}

func NewLibraryHandler(library libraryService, sessionSecret string) *LibraryHandler {
	return &LibraryHandler{
		library:       library,
		sessionSecret: []byte(sessionSecret),
	}
}

func preventProfileCaching(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Pragma", "no-cache")
}

func (h *LibraryHandler) resolveProfile(w http.ResponseWriter, r *http.Request) (string, bool) {
	sessionID, ok := resolveSessionID(r, h.sessionSecret)
	if !ok {
		sessionID = generateSessionID()
	}
	if err := h.library.EnsureProfile(sessionID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to initialize browser profile"})
		return "", false
	}
	setSessionCookie(w, r, h.sessionSecret, sessionID)
	return sessionID, true
}

func (h *LibraryHandler) RecoveryKeyHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		preventProfileCaching(w)
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		sessionID, ok := h.resolveProfile(w, r)
		if !ok {
			return
		}
		key, err := h.library.RotateRecoveryKey(sessionID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create recovery key"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"recoveryKey": key})
	}
}

type recoverProfileRequest struct {
	RecoveryKey string `json:"recoveryKey"`
}

func (h *LibraryHandler) RecoverHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		preventProfileCaching(w)
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 2048)
		var request recoverProfileRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
			return
		}
		request.RecoveryKey = strings.TrimSpace(request.RecoveryKey)
		sessionID, err := h.library.RecoverProfile(request.RecoveryKey)
		if errors.Is(err, services.ErrInvalidRecoveryKey) {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "That recovery key is not valid"})
			return
		}
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to recover browser profile"})
			return
		}
		setSessionCookie(w, r, h.sessionSecret, sessionID)
		clearMaturePreferenceCookie(w, r)
		writeJSON(w, http.StatusOK, recoverProfileResponse{ProfileID: sessionID})
	}
}

func (h *LibraryHandler) LikesHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		preventProfileCaching(w)
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		sessionID, ok := h.resolveProfile(w, r)
		if !ok {
			return
		}
		shareKeys, err := h.library.LikedTrackKeys(sessionID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to load likes"})
			return
		}
		hasRecoveryKey, err := h.library.ProfileHasRecoveryKey(sessionID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to load recovery settings"})
			return
		}
		writeJSON(w, http.StatusOK, likesResponse{
			ProfileID:      sessionID,
			HasRecoveryKey: hasRecoveryKey,
			ShareKeys:      shareKeys,
		})
	}
}

func (h *LibraryHandler) LikedTracksHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		preventProfileCaching(w)
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		sessionID, ok := h.resolveProfile(w, r)
		if !ok {
			return
		}
		tracks, err := h.library.LikedTracks(sessionID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to load liked tracks"})
			return
		}
		writeJSON(w, http.StatusOK, likedTracksResponse{Tracks: tracks})
	}
}

func (h *LibraryHandler) LikeItemHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		preventProfileCaching(w)
		if r.Method != http.MethodPut && r.Method != http.MethodDelete {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		shareKey := strings.TrimPrefix(r.URL.Path, "/api/likes/")
		if shareKey == "" || len(shareKey) > 128 || strings.Contains(shareKey, "/") {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid track key"})
			return
		}
		sessionID, ok := h.resolveProfile(w, r)
		if !ok {
			return
		}
		var err error
		switch r.Method {
		case http.MethodPut:
			err = h.library.Like(sessionID, shareKey)
		case http.MethodDelete:
			err = h.library.Unlike(sessionID, shareKey)
		}
		if err != nil {
			if errors.Is(err, services.ErrTrackNotFound) {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "Track not found"})
				return
			}
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update like"})
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
