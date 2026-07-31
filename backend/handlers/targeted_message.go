package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"
)

const (
	defaultTargetedMessageTitle = "A note for you"
	maxTargetedSessionIDLength  = 256
	maxTargetedMessageTitle     = 120
	maxTargetedMessageLength    = 4000
)

type targetedMessage struct {
	ID        int64     `json:"id"`
	SessionID string    `json:"sessionId,omitempty"`
	Title     string    `json:"title"`
	Message   string    `json:"message"`
	CreatedAt time.Time `json:"createdAt,omitempty"`
}

type TargetedMessageHandler struct {
	db            *sql.DB
	sessionSecret []byte
}

func NewTargetedMessageHandler(db *sql.DB, sessionSecret string) *TargetedMessageHandler {
	return &TargetedMessageHandler{
		db:            db,
		sessionSecret: []byte(sessionSecret),
	}
}

func (h *TargetedMessageHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}

	sessionID, ok := currentSessionID(r, h.sessionSecret)
	if !ok {
		setSessionCookie(w, r, h.sessionSecret, generateSessionID())
		w.WriteHeader(http.StatusNoContent)
		return
	}

	var message targetedMessage
	err := h.db.QueryRow(`
		DELETE FROM targeted_messages
		WHERE session_id = $1
		RETURNING id, title, message
	`, sessionID).Scan(&message.ID, &message.Title, &message.Message)
	if err != nil {
		if err == sql.ErrNoRows {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		log.Printf("targeted message: consume failed for session=%s: %v", sessionID, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
		return
	}

	writeJSON(w, http.StatusOK, message)
}

func (h *AdminHandler) handleTargetedMessageCreate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		SessionID string `json:"sessionId"`
		Title     string `json:"title"`
		Message   string `json:"message"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	body.SessionID = strings.TrimSpace(body.SessionID)
	body.Title = strings.TrimSpace(body.Title)
	body.Message = strings.TrimSpace(body.Message)
	if body.Title == "" {
		body.Title = defaultTargetedMessageTitle
	}

	switch {
	case body.SessionID == "":
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Session ID is required"})
		return
	case len(body.SessionID) > maxTargetedSessionIDLength:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Session ID is too long"})
		return
	case len(body.Title) > maxTargetedMessageTitle:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Title is too long"})
		return
	case body.Message == "":
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Message is required"})
		return
	case len(body.Message) > maxTargetedMessageLength:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Message is too long"})
		return
	}

	var message targetedMessage
	err := h.db.QueryRow(`
		INSERT INTO targeted_messages (session_id, title, message)
		VALUES ($1, $2, $3)
		ON CONFLICT (session_id) DO NOTHING
		RETURNING id, session_id, title, message, created_at
	`, body.SessionID, body.Title, body.Message).Scan(
		&message.ID,
		&message.SessionID,
		&message.Title,
		&message.Message,
		&message.CreatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusConflict, map[string]string{
				"error": "A pending message already exists for this session",
			})
			return
		}
		log.Printf("admin: targeted message create failed for session=%s: %v", body.SessionID, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Server error"})
		return
	}

	writeJSON(w, http.StatusCreated, message)
}
