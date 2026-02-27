package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/onion/audio-share-backend/services"
)

type AudioHandler struct {
	fs        *services.FileSystemService
	db        *sql.DB
	mimeTypes map[string]string
}

func NewAudioHandler(fs *services.FileSystemService, db *sql.DB) *AudioHandler {
	return &AudioHandler{
		fs: fs,
		db: db,
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
		},
	}
}

func (h *AudioHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Path format: /api/audio/key/{key}[/thumbnail|/meta]
	path := strings.TrimPrefix(r.URL.Path, "/api/audio/key/")
	path = strings.Trim(path, "/")

	var key, action string
	if strings.HasSuffix(path, "/thumbnail") {
		key = strings.TrimSuffix(path, "/thumbnail")
		action = "thumbnail"
	} else if strings.HasSuffix(path, "/meta") {
		key = strings.TrimSuffix(path, "/meta")
		action = "meta"
	} else {
		key = path
		action = "stream"
	}

	if key == "" {
		http.Error(w, "Key required", http.StatusBadRequest)
		return
	}

	switch action {
	case "stream":
		h.handleStream(w, r, key)
	case "thumbnail":
		h.handleThumbnail(w, r, key)
	case "meta":
		h.handleMeta(w, r, key)
	default:
		http.Error(w, "Not found", http.StatusNotFound)
	}
}

type audioRow struct {
	path        string
	deleted     bool
	thumbnail   sql.NullString
	title       sql.NullString
	artist      sql.NullString
	uploadDate  sql.NullString
	webpageURL  sql.NullString
	description sql.NullString
	parentPath  sql.NullString
}

func (h *AudioHandler) lookupByKey(key string) (*audioRow, error) {
	var row audioRow
	var deletedInt int
	err := h.db.QueryRow(`
		SELECT path, deleted, thumbnail, title, meta_artist, upload_date,
		       webpage_url, description, parent_path
		FROM audio_files WHERE share_key = ?
	`, key).Scan(
		&row.path, &deletedInt, &row.thumbnail, &row.title, &row.artist,
		&row.uploadDate, &row.webpageURL, &row.description, &row.parentPath,
	)
	if err != nil {
		return nil, err
	}
	row.deleted = deletedInt == 1
	return &row, nil
}

func (h *AudioHandler) resolveFullPath(virtualPath string) (string, bool) {
	parts := strings.SplitN(virtualPath, "/", 2)
	if len(parts) < 2 {
		return "", false
	}
	return h.fs.ValidatePath(parts[0], parts[1])
}

func (h *AudioHandler) handleStream(w http.ResponseWriter, r *http.Request, key string) {
	row, err := h.lookupByKey(key)
	if err == sql.ErrNoRows {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "Server error", http.StatusInternalServerError)
		return
	}
	if row.deleted {
		http.Error(w, "Gone", http.StatusGone)
		return
	}

	fullPath, valid := h.resolveFullPath(row.path)
	if !valid {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}

	info, err := os.Stat(fullPath)
	if err != nil || info.IsDir() {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}

	ext := strings.ToLower(filepath.Ext(fullPath))
	contentType := h.mimeTypes[ext]
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	file, err := os.Open(fullPath)
	if err != nil {
		http.Error(w, "Error opening file", http.StatusInternalServerError)
		return
	}
	defer file.Close()

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.Header().Set("Accept-Ranges", "bytes")

	http.ServeContent(w, r, info.Name(), info.ModTime(), file)
}

func (h *AudioHandler) handleThumbnail(w http.ResponseWriter, r *http.Request, key string) {
	row, err := h.lookupByKey(key)
	if err == sql.ErrNoRows {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "Server error", http.StatusInternalServerError)
		return
	}

	if !row.thumbnail.Valid || row.thumbnail.String == "" {
		http.Error(w, "No thumbnail", http.StatusNotFound)
		return
	}

	parts := strings.SplitN(row.path, "/", 2)
	if len(parts) < 2 {
		http.Error(w, "Invalid path", http.StatusInternalServerError)
		return
	}
	slug := parts[0]
	dir := filepath.Dir(parts[1])
	thumbRelPath := filepath.Join(dir, row.thumbnail.String)

	fullPath, valid := h.fs.ValidatePath(slug, thumbRelPath)
	if !valid {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}

	info, err := os.Stat(fullPath)
	if err != nil || info.IsDir() {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}

	ext := strings.ToLower(filepath.Ext(fullPath))
	contentType := h.mimeTypes[ext]
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

type AudioMeta struct {
	Title       string `json:"title"`
	Artist      string `json:"artist"`
	UploadDate  string `json:"uploadDate"`
	WebpageURL  string `json:"webpageUrl"`
	Description string `json:"description"`
	ParentPath  string `json:"parentPath"`
	Thumbnail   bool   `json:"thumbnail"`
	Deleted     bool   `json:"deleted"`
}

func (h *AudioHandler) handleMeta(w http.ResponseWriter, r *http.Request, key string) {
	row, err := h.lookupByKey(key)
	if err == sql.ErrNoRows {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "Server error", http.StatusInternalServerError)
		return
	}

	meta := AudioMeta{
		Thumbnail: row.thumbnail.Valid && row.thumbnail.String != "",
		Deleted:   row.deleted,
	}
	if row.title.Valid {
		meta.Title = row.title.String
	}
	if row.artist.Valid {
		meta.Artist = row.artist.String
	}
	if row.uploadDate.Valid {
		meta.UploadDate = row.uploadDate.String
	}
	if row.webpageURL.Valid {
		meta.WebpageURL = row.webpageURL.String
	}
	if row.description.Valid {
		meta.Description = row.description.String
	}
	if row.parentPath.Valid {
		meta.ParentPath = row.parentPath.String
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-cache")
	json.NewEncoder(w).Encode(meta)
}

type BrowseHandler struct {
	search *services.SearchService
}

func NewBrowseHandler(search *services.SearchService) *BrowseHandler {
	return &BrowseHandler{search: search}
}

func (h *BrowseHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Path format: /api/browse/{...path} or /api/browse for root
	path := strings.TrimPrefix(r.URL.Path, "/api/browse")
	path = strings.TrimPrefix(path, "/")

	contents, err := h.search.BrowseDirectory(path)
	if err != nil {
		http.Error(w, "Error reading directory", http.StatusInternalServerError)
		return
	}

	const maxSkipDepth = 20
	for i := 0; i < maxSkipDepth; i++ {
		if len(contents.Items) != 1 || contents.Items[0].Type != "folder" {
			break
		}
		next, err := h.search.BrowseDirectory(contents.Items[0].Path)
		if err != nil {
			break
		}
		contents = next
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(contents)
}
