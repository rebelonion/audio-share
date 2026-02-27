package handlers

import (
	"database/sql"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/onion/audio-share-backend/services"
)

type FolderHandler struct {
	fs *services.FileSystemService
	db *sql.DB
}

func NewFolderHandler(fs *services.FileSystemService, db *sql.DB) *FolderHandler {
	return &FolderHandler{fs: fs, db: db}
}

func (h *FolderHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Path format: /api/folder/key/{key}/poster
	path := strings.TrimPrefix(r.URL.Path, "/api/folder/key/")
	path = strings.Trim(path, "/")

	if !strings.HasSuffix(path, "/poster") {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}

	key := strings.TrimSuffix(path, "/poster")
	if key == "" {
		http.Error(w, "Key required", http.StatusBadRequest)
		return
	}

	var folderPath, posterImage string
	err := h.db.QueryRow(
		"SELECT path, COALESCE(poster_image, '') FROM folders WHERE share_key = ?", key,
	).Scan(&folderPath, &posterImage)
	if err == sql.ErrNoRows {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "Server error", http.StatusInternalServerError)
		return
	}
	if posterImage == "" {
		http.Error(w, "No poster image", http.StatusNotFound)
		return
	}

	parts := strings.SplitN(folderPath, "/", 2)
	slug := parts[0]
	var relDir string
	if len(parts) > 1 {
		relDir = parts[1]
	}

	posterRelPath := filepath.Join(relDir, posterImage)
	fullPath, valid := h.fs.ValidatePath(slug, posterRelPath)
	if !valid {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}

	info, err := os.Stat(fullPath)
	if err != nil || info.IsDir() {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}

	mimeTypes := map[string]string{
		".jpg": "image/jpeg", ".jpeg": "image/jpeg",
		".png": "image/png", ".gif": "image/gif", ".webp": "image/webp",
	}
	ext := strings.ToLower(filepath.Ext(fullPath))
	contentType := mimeTypes[ext]
	if contentType == "" {
		contentType = "image/jpeg"
	}

	file, err := os.Open(fullPath)
	if err != nil {
		http.Error(w, "Error opening file", http.StatusInternalServerError)
		return
	}
	defer file.Close()

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=86400")
	http.ServeContent(w, r, info.Name(), info.ModTime(), file)
}
