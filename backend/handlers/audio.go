package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/onion/audio-share-backend/services"
)

type AudioHandler struct {
	fs        *services.FileSystemService
	mimeTypes map[string]string
}

func NewAudioHandler(fs *services.FileSystemService) *AudioHandler {
	return &AudioHandler{
		fs: fs,
		mimeTypes: map[string]string{
			".mp3":  "audio/mpeg",
			".wav":  "audio/wav",
			".ogg":  "audio/ogg",
			".flac": "audio/flac",
			".aac":  "audio/aac",
			".m4a":  "audio/mp4",
			".opus": "audio/opus",
			".jpg":  "image/jpeg",
			".jpeg": "image/jpeg",
			".png":  "image/png",
			".gif":  "image/gif",
			".webp": "image/webp",
			".json": "application/json",
		},
	}
}

func (h *AudioHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Path format: /api/audio/{slug}/{...path}
	path := strings.TrimPrefix(r.URL.Path, "/api/audio/")
	if path == "" {
		http.Error(w, "Path required", http.StatusBadRequest)
		return
	}

	parts := strings.SplitN(path, "/", 2)
	if len(parts) < 2 {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	slug := parts[0]
	relativePath := parts[1]

	fullPath, valid := h.fs.ValidatePath(slug, relativePath)
	if !valid {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	info, err := os.Stat(fullPath)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	if info.IsDir() {
		http.Error(w, "Not a file", http.StatusBadRequest)
		return
	}

	ext := strings.ToLower(filepath.Ext(fullPath))
	contentType, ok := h.mimeTypes[ext]
	if !ok {
		contentType = "application/octet-stream"
	}

	cacheControl := "public, max-age=3600" // 1 hour default
	if strings.HasPrefix(contentType, "image/") {
		cacheControl = "public, max-age=86400" // 24 hours for images
	}

	if ext == ".json" {
		data, err := os.ReadFile(fullPath)
		if err != nil {
			http.Error(w, "Error reading file", http.StatusInternalServerError)
			return
		}
		var js json.RawMessage
		if err := json.Unmarshal(data, &js); err != nil {
			http.Error(w, "Invalid JSON file", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", contentType)
		w.Header().Set("Cache-Control", cacheControl)
		w.Write(data)
		return
	}

	file, err := os.Open(fullPath)
	if err != nil {
		http.Error(w, "Error opening file", http.StatusInternalServerError)
		return
	}
	defer file.Close()

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", cacheControl)
	w.Header().Set("Accept-Ranges", "bytes")

	http.ServeContent(w, r, info.Name(), info.ModTime(), file)
}

type BrowseHandler struct {
	fs     *services.FileSystemService
	search *services.SearchService
}

func NewBrowseHandler(fs *services.FileSystemService, search *services.SearchService) *BrowseHandler {
	return &BrowseHandler{fs: fs, search: search}
}

func (h *BrowseHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Path format: /api/browse/{...path} or /api/browse for root
	path := strings.TrimPrefix(r.URL.Path, "/api/browse")
	path = strings.TrimPrefix(path, "/")

	var contents *services.DirectoryContents
	var err error

	// Use filesystem directly if ?raw=true, otherwise use database
	if r.URL.Query().Get("raw") == "true" {
		contents, err = h.fs.GetDirectoryContents(path)
	} else {
		contents, err = h.search.BrowseDirectory(path)
	}

	if err != nil {
		http.Error(w, "Error reading directory", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(contents)
}

func ReadFile(fs *services.FileSystemService, slug, relativePath string) ([]byte, string, error) {
	fullPath, valid := fs.ValidatePath(slug, relativePath)
	if !valid {
		return nil, "", os.ErrNotExist
	}

	data, err := os.ReadFile(fullPath)
	if err != nil {
		return nil, "", err
	}

	ext := strings.ToLower(filepath.Ext(fullPath))
	mimeTypes := map[string]string{
		".jpg": "image/jpeg", ".jpeg": "image/jpeg",
		".png": "image/png", ".gif": "image/gif", ".webp": "image/webp",
	}

	contentType := mimeTypes[ext]
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	return data, contentType, nil
}

func StreamFile(fs *services.FileSystemService, slug, relativePath string) (io.ReadSeekCloser, os.FileInfo, string, error) {
	fullPath, valid := fs.ValidatePath(slug, relativePath)
	if !valid {
		return nil, nil, "", os.ErrNotExist
	}

	info, err := os.Stat(fullPath)
	if err != nil {
		return nil, nil, "", err
	}

	file, err := os.Open(fullPath)
	if err != nil {
		return nil, nil, "", err
	}

	ext := strings.ToLower(filepath.Ext(fullPath))
	mimeTypes := map[string]string{
		".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
		".flac": "audio/flac", ".aac": "audio/aac", ".m4a": "audio/mp4", ".opus": "audio/opus",
	}

	contentType := mimeTypes[ext]
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	return file, info, contentType, nil
}
