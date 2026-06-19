package handlers

import (
	"encoding/json"
	"net/http"
)

type PreferencesHandler struct {
	sessionSecret []byte
}

func NewPreferencesHandler(sessionSecret string) *PreferencesHandler {
	return &PreferencesHandler{sessionSecret: []byte(sessionSecret)}
}

type maturePreferenceRequest struct {
	Enabled bool `json:"enabled"`
}

type maturePreferenceResponse struct {
	Enabled bool `json:"enabled"`
}

func (h *PreferencesHandler) MatureContentHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			writeJSON(w, http.StatusOK, maturePreferenceResponse{
				Enabled: maturePreferenceEnabled(r, h.sessionSecret),
			})
		case http.MethodPost:
			var req maturePreferenceRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
				return
			}

			sessionID, ok := resolveSessionID(r, h.sessionSecret)
			if !ok {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "Invalid session"})
				return
			}
			setSessionCookie(w, r, h.sessionSecret, sessionID)

			if req.Enabled {
				setMaturePreferenceCookie(w, r, h.sessionSecret, sessionID)
			} else {
				clearMaturePreferenceCookie(w, r)
			}

			writeJSON(w, http.StatusOK, maturePreferenceResponse{Enabled: req.Enabled})
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}
}
