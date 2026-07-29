package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/onion/audio-share-backend/services"
)

type ContactHandler struct {
	ntfy          *services.NtfyService
	sessionSecret []byte
}

func NewContactHandler(ntfy *services.NtfyService, sessionSecret string) *ContactHandler {
	return &ContactHandler{
		ntfy:          ntfy,
		sessionSecret: []byte(sessionSecret),
	}
}

type contactRequest struct {
	Topic      string `json:"topic"`
	Email      string `json:"email"`
	Message    string `json:"message"`
	Browser    string `json:"browser"`
	Platform   string `json:"platform"`
	Viewport   string `json:"viewport"`
	Screen     string `json:"screen"`
	Language   string `json:"language"`
	Timezone   string `json:"timezone"`
	Page       string `json:"page"`
	AppBuildID string `json:"appBuildId"`
}

var emailRegex = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

const maxContactImageSize = 15 << 20

var (
	errContactImageTooLarge = errors.New("Image attachment must be 15 MB or smaller")
	errInvalidContactImage  = errors.New("Attachment must be an image")
)

func (h *ContactHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	req, attachment, cleanup, err := parseContactRequest(w, r)
	if cleanup != nil {
		defer cleanup()
	}
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	req.Topic = strings.TrimSpace(req.Topic)
	req.Email = strings.TrimSpace(req.Email)
	req.Message = strings.TrimSpace(req.Message)

	if req.Topic == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Topic is required"})
		return
	}

	if req.Topic == "abuse" && req.Email == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Email is required for abuse reports"})
		return
	}

	if req.Message == "" {
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

	diagnostics := services.ContactDiagnostics{
		Browser:    sanitizeDiagnostic(req.Browser, 100),
		Platform:   sanitizeDiagnostic(req.Platform, 100),
		Viewport:   sanitizeDiagnostic(req.Viewport, 50),
		Screen:     sanitizeDiagnostic(req.Screen, 50),
		Language:   sanitizeDiagnostic(req.Language, 50),
		Timezone:   sanitizeDiagnostic(req.Timezone, 100),
		Page:       sanitizeDiagnostic(req.Page, 300),
		AppBuildID: sanitizeDiagnostic(req.AppBuildID, 100),
		UserAgent:  sanitizeDiagnostic(r.UserAgent(), 500),
	}
	sessionID, ok := resolveSessionID(r, h.sessionSecret)
	if !ok {
		sessionID = generateSessionID()
	}
	setSessionCookie(w, r, h.sessionSecret, sessionID)
	diagnostics.SessionID = sessionID

	if err := h.ntfy.SendContactNotification(req.Topic, req.Email, req.Message, diagnostics, attachment); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to send notification"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func parseContactRequest(w http.ResponseWriter, r *http.Request) (contactRequest, *services.NtfyAttachment, func(), error) {
	contentType := r.Header.Get("Content-Type")
	if strings.HasPrefix(contentType, "multipart/form-data") {
		r.Body = http.MaxBytesReader(w, r.Body, maxContactImageSize+(1<<20))
		if err := r.ParseMultipartForm(maxContactImageSize); err != nil {
			return contactRequest{}, nil, nil, err
		}
		cleanupForm := func() {
			if r.MultipartForm != nil {
				_ = r.MultipartForm.RemoveAll()
			}
		}

		req := contactRequest{
			Topic:      r.FormValue("topic"),
			Email:      r.FormValue("email"),
			Message:    r.FormValue("message"),
			Browser:    r.FormValue("browser"),
			Platform:   r.FormValue("platform"),
			Viewport:   r.FormValue("viewport"),
			Screen:     r.FormValue("screen"),
			Language:   r.FormValue("language"),
			Timezone:   r.FormValue("timezone"),
			Page:       r.FormValue("page"),
			AppBuildID: r.FormValue("appBuildId"),
		}

		file, header, err := r.FormFile("image")
		if err == http.ErrMissingFile {
			return req, nil, cleanupForm, nil
		}
		if err != nil {
			return contactRequest{}, nil, cleanupForm, err
		}

		cleanup := func() {
			file.Close()
			cleanupForm()
		}

		if header.Size > maxContactImageSize {
			return contactRequest{}, nil, cleanup, errContactImageTooLarge
		}

		buffer := make([]byte, 512)
		n, err := file.Read(buffer)
		if err != nil && err != io.EOF {
			return contactRequest{}, nil, cleanup, err
		}
		if _, err := file.Seek(0, io.SeekStart); err != nil {
			return contactRequest{}, nil, cleanup, err
		}

		contentType := http.DetectContentType(buffer[:n])
		if !strings.HasPrefix(contentType, "image/") {
			return contactRequest{}, nil, cleanup, errInvalidContactImage
		}

		filename := filepath.Base(header.Filename)
		if filename == "." || filename == string(filepath.Separator) {
			filename = "contact-image"
		}

		attachment := &services.NtfyAttachment{
			Filename:    filename,
			ContentType: contentType,
			Reader:      file,
		}

		return req, attachment, cleanup, nil
	}

	var req contactRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		return contactRequest{}, nil, nil, err
	}

	return req, nil, nil, nil
}

func sanitizeDiagnostic(value string, maxRunes int) string {
	value = strings.Join(strings.Fields(value), " ")
	runes := []rune(value)
	if len(runes) > maxRunes {
		value = string(runes[:maxRunes])
	}
	return value
}
