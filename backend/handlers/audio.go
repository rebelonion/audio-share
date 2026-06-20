package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/onion/audio-share-backend/services"
)

type AudioHandler struct {
	fs                     *services.FileSystemService
	db                     *sql.DB
	streamBytesPerSecond   int64
	downloadBytesPerSecond int64
	sessionSecret          []byte
	mimeTypes              map[string]string
}

func NewAudioHandler(fs *services.FileSystemService, db *sql.DB, streamBytesPerSecond, downloadBytesPerSecond int64, sessionSecret string) *AudioHandler {
	return &AudioHandler{
		fs:                     fs,
		db:                     db,
		streamBytesPerSecond:   streamBytesPerSecond,
		downloadBytesPerSecond: downloadBytesPerSecond,
		sessionSecret:          []byte(sessionSecret),
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
	w.Header().Set("X-Robots-Tag", "noindex, nofollow, noarchive")

	// Path format: /api/audio/key/{key}[/thumbnail|/meta|/waveform|/download]
	path := strings.TrimPrefix(r.URL.Path, "/api/audio/key/")
	path = strings.Trim(path, "/")

	var key, action string
	if strings.HasSuffix(path, "/thumbnail") {
		key = strings.TrimSuffix(path, "/thumbnail")
		action = "thumbnail"
	} else if strings.HasSuffix(path, "/meta") {
		key = strings.TrimSuffix(path, "/meta")
		action = "meta"
	} else if strings.HasSuffix(path, "/waveform") {
		key = strings.TrimSuffix(path, "/waveform")
		action = "waveform"
	} else if strings.HasSuffix(path, "/download") {
		key = strings.TrimSuffix(path, "/download")
		action = "download"
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
		h.handleStream(w, r, key, false)
	case "download":
		h.handleStream(w, r, key, true)
	case "thumbnail":
		h.handleThumbnail(w, r, key)
	case "meta":
		h.handleMeta(w, r, key)
	case "waveform":
		h.handleWaveform(w, r, key)
	default:
		http.Error(w, "Not found", http.StatusNotFound)
	}
}

type audioRow struct {
	id            int64
	path          string
	deleted       bool
	unavailableAt sql.NullTime
	thumbnail     sql.NullString
	title         sql.NullString
	artist        sql.NullString
	uploadDate    sql.NullString
	webpageURL    sql.NullString
	description   sql.NullString
	ageLimit      sql.NullInt64
	parentPath    sql.NullString
}

func (h *AudioHandler) lookupByKey(key string) (*audioRow, error) {
	var row audioRow
	var deletedInt int
	err := h.db.QueryRow(`
		SELECT id, path, deleted, unavailable_at, thumbnail, title, meta_artist, upload_date,
		       webpage_url, description, age_limit, parent_path
		FROM audio_files WHERE share_key = $1
	`, key).Scan(
		&row.id, &row.path, &deletedInt, &row.unavailableAt, &row.thumbnail, &row.title, &row.artist,
		&row.uploadDate, &row.webpageURL, &row.description, &row.ageLimit, &row.parentPath,
	)
	if err != nil {
		return nil, err
	}
	row.deleted = deletedInt == 1
	return &row, nil
}

func (r *audioRow) isMature() bool {
	return r.ageLimit.Valid && r.ageLimit.Int64 >= 18
}

func (h *AudioHandler) resolveFullPath(virtualPath string) (string, bool) {
	parts := strings.SplitN(virtualPath, "/", 2)
	if len(parts) < 2 {
		return "", false
	}
	return h.fs.ValidatePath(parts[0], parts[1])
}

func (h *AudioHandler) handleStream(w http.ResponseWriter, r *http.Request, key string, download bool) {
	if download && isBotLikeUserAgent(r.UserAgent()) {
		http.Error(w, "Bot downloads are not allowed", http.StatusForbidden)
		return
	}

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
	if download {
		w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{
			"filename": info.Name(),
		}))
	}
	if r.Method == http.MethodGet && (download || isInitialStreamRequest(r)) {
		eventType := "stream"
		if download {
			eventType = "download"
		}
		h.recordMediaEvent(r, row.id, key, eventType, info.Size())
	}

	reader := newThrottledReadSeeker(file, h.bytesPerSecond(download))
	http.ServeContent(w, r, info.Name(), info.ModTime(), reader)
}

func (h *AudioHandler) bytesPerSecond(download bool) int64 {
	if download {
		return h.downloadBytesPerSecond
	}
	return h.streamBytesPerSecond
}

func isInitialStreamRequest(r *http.Request) bool {
	rangeHeader := r.Header.Get("Range")
	return rangeHeader == "" || strings.HasPrefix(rangeHeader, "bytes=0-")
}

func isBotLikeUserAgent(userAgent string) bool {
	ua := strings.ToLower(userAgent)
	if ua == "" {
		return false
	}

	botMarkers := []string{
		"ahrefsbot",
		"applebot",
		"baiduspider",
		"bingbot",
		"bytespider",
		"crawler",
		"discordbot",
		"dotbot",
		"duckduckbot",
		"facebookexternalhit",
		"googlebot",
		"linkedinbot",
		"mj12bot",
		"petalbot",
		"pinterestbot",
		"preview",
		"semrushbot",
		"slackbot",
		"spider",
		"telegrambot",
		"twitterbot",
		"whatsapp",
		"yandexbot",
	}

	for _, marker := range botMarkers {
		if strings.Contains(ua, marker) {
			return true
		}
	}
	return false
}

func (h *AudioHandler) recordMediaEvent(r *http.Request, audioFileID int64, shareKey, eventType string, fileSize int64) {
	sessionID := ""
	if id, ok := currentSessionID(r, h.sessionSecret); ok {
		sessionID = id
	}

	requestedBytes := estimateRequestedBytes(r.Header.Get("Range"), fileSize)
	_, err := h.db.Exec(`
		INSERT INTO download_events (
			audio_file_id, event_type, share_key, session_id, client_ip, user_agent,
			referer, range_header, method, file_size, requested_bytes
		)
		VALUES ($1, $2, $3, NULLIF($4, ''), $5, $6, $7, $8, $9, $10, $11)
	`, audioFileID, eventType, shareKey, sessionID, clientIP(r), r.UserAgent(),
		r.Referer(), r.Header.Get("Range"), r.Method, fileSize, requestedBytes)
	if err != nil {
		log.Printf("Error recording %s event for audio_file_id=%d: %v", eventType, audioFileID, err)
	}
}

func clientIP(r *http.Request) string {
	if ip := r.Header.Get("CF-Connecting-IP"); ip != "" {
		return ip
	}
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		if len(parts) > 0 {
			return strings.TrimSpace(parts[0])
		}
	}
	addr := r.RemoteAddr
	if idx := strings.LastIndex(addr, ":"); idx != -1 {
		return addr[:idx]
	}
	return addr
}

func estimateRequestedBytes(rangeHeader string, fileSize int64) int64 {
	if fileSize <= 0 {
		return 0
	}
	if rangeHeader == "" {
		return fileSize
	}
	if !strings.HasPrefix(rangeHeader, "bytes=") {
		return fileSize
	}

	var total int64
	ranges := strings.Split(strings.TrimPrefix(rangeHeader, "bytes="), ",")
	for _, rawRange := range ranges {
		rawRange = strings.TrimSpace(rawRange)
		if rawRange == "" {
			continue
		}
		parts := strings.SplitN(rawRange, "-", 2)
		if len(parts) != 2 {
			return fileSize
		}

		if parts[0] == "" {
			suffixLength, err := strconv.ParseInt(parts[1], 10, 64)
			if err != nil || suffixLength < 0 {
				return fileSize
			}
			total += min(suffixLength, fileSize)
			continue
		}

		start, err := strconv.ParseInt(parts[0], 10, 64)
		if err != nil || start < 0 || start >= fileSize {
			return fileSize
		}
		end := fileSize - 1
		if parts[1] != "" {
			parsedEnd, err := strconv.ParseInt(parts[1], 10, 64)
			if err != nil || parsedEnd < start {
				return fileSize
			}
			end = min(parsedEnd, fileSize-1)
		}
		total += end - start + 1
	}
	if total <= 0 {
		return fileSize
	}
	return min(total, fileSize)
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

	view := r.URL.Query().Get("view")
	if view != "blurred" && view != "original" {
		if row.isMature() && !maturePreferenceEnabled(r, h.sessionSecret) {
			view = "blurred"
		} else {
			view = "original"
		}
	}

	if row.isMature() && view == "blurred" {
		h.serveBlurredThumbnail(w, r, key, fullPath, info)
		return
	}
	if row.isMature() && view == "original" && !maturePreferenceEnabled(r, h.sessionSecret) {
		http.Error(w, "Mature content preference required", http.StatusForbidden)
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
	if row.isMature() {
		w.Header().Set("Cache-Control", "private, max-age=86400")
	} else {
		w.Header().Set("Cache-Control", "public, max-age=86400")
	}

	http.ServeContent(w, r, info.Name(), info.ModTime(), file)
}

func (h *AudioHandler) serveBlurredThumbnail(w http.ResponseWriter, r *http.Request, key, fullPath string, info os.FileInfo) {
	cacheDir := filepath.Join(os.TempDir(), "audio-share-mature-thumbnails")
	if err := os.MkdirAll(cacheDir, 0700); err != nil {
		http.Error(w, "Error preparing thumbnail", http.StatusInternalServerError)
		return
	}

	cacheName := fmt.Sprintf("%s-blur-v1-%d-%d.jpg", key, info.ModTime().Unix(), info.Size())
	cachePath := filepath.Join(cacheDir, cacheName)
	if cachedInfo, err := os.Stat(cachePath); err == nil && !cachedInfo.IsDir() {
		file, err := os.Open(cachePath)
		if err == nil {
			defer file.Close()
			w.Header().Set("Content-Type", "image/jpeg")
			w.Header().Set("Cache-Control", "public, max-age=86400")
			http.ServeContent(w, r, cacheName, cachedInfo.ModTime(), file)
			return
		}
	}

	if err := generateBlurredThumbnail(fullPath, cachePath); err != nil {
		if err := generateMaturePlaceholder(cachePath); err != nil {
			http.Error(w, "Error generating thumbnail", http.StatusInternalServerError)
			return
		}
	}

	cachedInfo, err := os.Stat(cachePath)
	if err != nil {
		http.Error(w, "Error reading thumbnail", http.StatusInternalServerError)
		return
	}
	file, err := os.Open(cachePath)
	if err != nil {
		http.Error(w, "Error opening thumbnail", http.StatusInternalServerError)
		return
	}
	defer file.Close()

	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	http.ServeContent(w, r, cacheName, cachedInfo.ModTime(), file)
}

func generateBlurredThumbnail(srcPath, dstPath string) error {
	file, err := os.Open(srcPath)
	if err != nil {
		return err
	}
	defer file.Close()

	src, _, err := image.Decode(file)
	if err != nil {
		return err
	}

	bounds := src.Bounds()
	width, height := scaledDimensions(bounds.Dx(), bounds.Dy(), 360)
	scaled := resizeNearest(src, width, height)
	blurred := boxBlur(scaled, 14, 3)
	return writeJPEG(dstPath, blurred)
}

func generateMaturePlaceholder(dstPath string) error {
	img := image.NewRGBA(image.Rect(0, 0, 360, 360))
	draw.Draw(img, img.Bounds(), &image.Uniform{C: color.RGBA{R: 30, G: 28, B: 24, A: 255}}, image.Point{}, draw.Src)
	for y := 0; y < 360; y++ {
		for x := 0; x < 360; x++ {
			if (x/18+y/18)%2 == 0 {
				img.SetRGBA(x, y, color.RGBA{R: 49, G: 44, B: 36, A: 255})
			}
		}
	}
	return writeJPEG(dstPath, img)
}

func resizeNearest(src image.Image, width, height int) *image.RGBA {
	dst := image.NewRGBA(image.Rect(0, 0, width, height))
	b := src.Bounds()
	srcW := b.Dx()
	srcH := b.Dy()
	for y := 0; y < height; y++ {
		sy := b.Min.Y + y*srcH/height
		for x := 0; x < width; x++ {
			sx := b.Min.X + x*srcW/width
			dst.Set(x, y, src.At(sx, sy))
		}
	}
	return dst
}

func boxBlur(src *image.RGBA, radius, iterations int) *image.RGBA {
	if radius <= 0 || iterations <= 0 {
		return src
	}

	blurred := src
	for range iterations {
		blurred = boxBlurOnce(blurred, radius)
	}
	return blurred
}

func boxBlurOnce(src *image.RGBA, radius int) *image.RGBA {
	bounds := src.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()
	if width == 0 || height == 0 {
		return src
	}

	horizontal := image.NewRGBA(bounds)
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			var r, g, b, a, count uint32
			for offset := -radius; offset <= radius; offset++ {
				sx := x + offset
				if sx < bounds.Min.X {
					sx = bounds.Min.X
				} else if sx >= bounds.Max.X {
					sx = bounds.Max.X - 1
				}
				c := src.RGBAAt(sx, y)
				r += uint32(c.R)
				g += uint32(c.G)
				b += uint32(c.B)
				a += uint32(c.A)
				count++
			}
			horizontal.SetRGBA(x, y, color.RGBA{
				R: uint8(r / count),
				G: uint8(g / count),
				B: uint8(b / count),
				A: uint8(a / count),
			})
		}
	}

	vertical := image.NewRGBA(bounds)
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			var r, g, b, a, count uint32
			for offset := -radius; offset <= radius; offset++ {
				sy := y + offset
				if sy < bounds.Min.Y {
					sy = bounds.Min.Y
				} else if sy >= bounds.Max.Y {
					sy = bounds.Max.Y - 1
				}
				c := horizontal.RGBAAt(x, sy)
				r += uint32(c.R)
				g += uint32(c.G)
				b += uint32(c.B)
				a += uint32(c.A)
				count++
			}
			vertical.SetRGBA(x, y, color.RGBA{
				R: uint8(r / count),
				G: uint8(g / count),
				B: uint8(b / count),
				A: uint8(a / count),
			})
		}
	}

	return vertical
}

func scaledDimensions(width, height, maxSide int) (int, int) {
	if width <= 0 || height <= 0 {
		return maxSide, maxSide
	}
	if width >= height {
		scaledHeight := max(1, height*maxSide/width)
		return maxSide, scaledHeight
	}
	scaledWidth := max(1, width*maxSide/height)
	return scaledWidth, maxSide
}

func writeJPEG(path string, img image.Image) error {
	tmp := path + ".tmp"
	file, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if err := jpeg.Encode(file, img, &jpeg.Options{Quality: 72}); err != nil {
		file.Close()
		os.Remove(tmp)
		return err
	}
	if err := file.Close(); err != nil {
		os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, path)
}

type AudioMeta struct {
	Title         string  `json:"title"`
	Artist        string  `json:"artist"`
	UploadDate    string  `json:"uploadDate"`
	WebpageURL    string  `json:"webpageUrl"`
	Description   string  `json:"description"`
	ParentPath    string  `json:"parentPath"`
	Thumbnail     bool    `json:"thumbnail"`
	Deleted       bool    `json:"deleted"`
	UnavailableAt *string `json:"unavailableAt"`
	AgeLimit      *int    `json:"ageLimit,omitempty"`
	IsMature      bool    `json:"isMature"`
	ShowMature    bool    `json:"showMature"`
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
		Thumbnail:  row.thumbnail.Valid && row.thumbnail.String != "",
		Deleted:    row.deleted,
		IsMature:   row.isMature(),
		ShowMature: maturePreferenceEnabled(r, h.sessionSecret),
	}
	if row.ageLimit.Valid {
		ageLimit := int(row.ageLimit.Int64)
		meta.AgeLimit = &ageLimit
	}
	if row.unavailableAt.Valid {
		s := row.unavailableAt.Time.UTC().Format(time.RFC3339)
		meta.UnavailableAt = &s
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

func (h *AudioHandler) handleWaveform(w http.ResponseWriter, r *http.Request, key string) {
	var fileID int64
	err := h.db.QueryRow(`
		SELECT id FROM audio_files WHERE share_key = $1 AND deleted = 0
	`, key).Scan(&fileID)
	if err == sql.ErrNoRows {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "Server error", http.StatusInternalServerError)
		return
	}

	var peaks string
	var duration sql.NullFloat64
	err = h.db.QueryRow(`
		SELECT peaks, duration_seconds FROM waveform_cache WHERE audio_file_id = $1
	`, fileID).Scan(&peaks, &duration)
	if err == sql.ErrNoRows {
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if err != nil {
		http.Error(w, "Server error", http.StatusInternalServerError)
		return
	}

	resp := map[string]any{"peaks": peaks}
	if duration.Valid {
		resp["duration"] = duration.Float64
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	json.NewEncoder(w).Encode(resp)
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
