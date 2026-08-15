package handlers

import (
	"database/sql"
	"encoding/json"
	"html"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

type FrontendConfig struct {
	DefaultTitle       string `json:"defaultTitle,omitempty"`
	DefaultDescription string `json:"defaultDescription,omitempty"`
	BannerMessage      string `json:"bannerMessage,omitempty"`
	BannerVariant      string `json:"bannerVariant,omitempty"`
	BannerLinkText     string `json:"bannerLinkText,omitempty"`
	BannerLinkURL      string `json:"bannerLinkUrl,omitempty"`
	CapPublicEndpoint  string `json:"capPublicEndpoint,omitempty"`
	BuildID            string `json:"buildId,omitempty"`
}

type SPAHandler struct {
	staticDir       string
	htmlTemplate    string
	db              *sql.DB
	config          FrontendConfig
	contentDir      string
	searchService   snapshotSearchService
	requestsService snapshotRequestsService
	sessionSecret   []byte
}

type SPAHandlerOptions struct {
	ContentDir      string
	SearchService   snapshotSearchService
	RequestsService snapshotRequestsService
	SessionSecret   string
}

func NewSPAHandler(staticDir string, config FrontendConfig, rybbitURL, rybbitSiteID string, db *sql.DB, options ...SPAHandlerOptions) *SPAHandler {
	cleanDir := filepath.Clean(staticDir)
	indexPath := filepath.Join(cleanDir, "index.html")

	var htmlTemplate string
	if data, err := os.ReadFile(indexPath); err == nil {
		configJSON, _ := json.Marshal(config)
		configScript := `<script>window.__CONFIG__=` + string(configJSON) + `</script>`

		ldJSON, _ := json.Marshal(map[string]string{
			"@context":    "https://schema.org",
			"@type":       "WebSite",
			"name":        config.DefaultTitle,
			"description": config.DefaultDescription,
		})
		ldScript := `<script type="application/ld+json">` + string(ldJSON) + `</script>`

		injection := configScript + ldScript
		if rybbitURL != "" && rybbitSiteID != "" {
			injection += `<script defer src="` + html.EscapeString(rybbitURL) + `/api/script.js" data-site-id="` + html.EscapeString(rybbitSiteID) + `"></script>`
		}

		// Store template with config/ld+json/analytics injected but without title or meta tags;
		// those are injected per-request in serveRoute.
		htmlTemplate = strings.Replace(string(data), "</head>", injection+"</head>", 1)
	}

	handler := &SPAHandler{
		staticDir:    cleanDir,
		htmlTemplate: htmlTemplate,
		db:           db,
		config:       config,
	}
	if len(options) > 0 {
		handler.contentDir = options[0].ContentDir
		handler.searchService = options[0].SearchService
		handler.requestsService = options[0].RequestsService
		handler.sessionSecret = []byte(options[0].SessionSecret)
	}
	return handler
}

func (h *SPAHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path := filepath.Clean(r.URL.Path)
	if path == "/" {
		path = "/index.html"
	}

	fullPath := filepath.Join(h.staticDir, path)

	if !strings.HasPrefix(fullPath, h.staticDir) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	info, err := os.Stat(fullPath)
	if err != nil || info.IsDir() {
		h.serveRoute(w, r)
		return
	}

	if filepath.Base(fullPath) == "index.html" {
		h.serveRoute(w, r)
		return
	}

	if strings.HasPrefix(path, "/assets/") {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	}
	http.ServeFile(w, r, fullPath)
}

func (h *SPAHandler) VersionHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{
			"buildId": h.config.BuildID,
		})
	}
}

type pageMeta struct {
	title       string
	description string
	h1          string
	imageURL    string // absolute URL, empty if none
	ogType      string // og:type value, defaults to "website"
	notFound    bool
}

func siteOrigin(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	return scheme + "://" + r.Host
}

func isBrowseRoute(path string) bool {
	return path == "/browse" || strings.HasPrefix(path, "/browse/")
}

func shareKeyFromPath(path string) (string, bool) {
	if !strings.HasPrefix(path, "/share/") {
		return "", false
	}
	key := strings.Trim(strings.TrimPrefix(path, "/share/"), "/")
	return key, key != ""
}

func (h *SPAHandler) audioRowForRoute(r *http.Request) (*audioRow, error) {
	key, ok := shareKeyFromPath(r.URL.Path)
	if !ok || h.db == nil {
		return nil, nil
	}
	return lookupAudioByKey(h.db, key)
}

func (h *SPAHandler) getPageMeta(r *http.Request) pageMeta {
	row, _ := h.audioRowForRoute(r)
	return h.getPageMetaWithAudio(r, row)
}

func (h *SPAHandler) getPageMetaWithAudio(r *http.Request, row *audioRow) pageMeta {
	urlPath := r.URL.Path
	origin := siteOrigin(r)

	if _, ok := shareKeyFromPath(urlPath); ok && row != nil && row.removalRestricted(r) {
		const message = "Due to a request from the original creator, this audio is no longer shared."
		return pageMeta{
			title:       "Audio no longer shared - " + h.config.DefaultTitle,
			description: message,
			h1:          "Audio no longer shared",
		}
	}

	// /share/:key — look up audio metadata from DB
	if key, ok := shareKeyFromPath(urlPath); ok && row != nil && !row.deleted {
		t := h.config.DefaultTitle
		if row.title.Valid && row.title.String != "" {
			t = row.title.String
		}
		if row.artist.Valid && row.artist.String != "" {
			t = t + " by " + row.artist.String
		}
		desc := h.config.DefaultDescription + " · " + t
		imageURL := ""
		if row.thumbnail.Valid && row.thumbnail.String != "" {
			imageURL = origin + "/api/audio/key/" + key + "/thumbnail"
		}
		return pageMeta{
			title:       t + " - " + h.config.DefaultTitle,
			description: desc,
			h1:          t,
			imageURL:    imageURL,
			ogType:      "music.song",
		}
	}

	// /browse/* — use the last path segment as folder name
	if isBrowseRoute(urlPath) {
		pathStr := strings.Trim(strings.TrimPrefix(urlPath, "/browse"), "/")
		folderName := "Root"
		if pathStr != "" {
			segments := strings.Split(pathStr, "/")
			folderName = segments[len(segments)-1]
		}
		return pageMeta{
			title:       folderName + " - " + h.config.DefaultTitle,
			description: h.config.DefaultDescription + " · Browse " + folderName,
			h1:          folderName,
		}
	}

	// Static pages
	switch urlPath {
	case "/", "/index.html":
		return pageMeta{title: h.config.DefaultTitle, description: h.config.DefaultDescription, h1: h.config.DefaultTitle}
	case "/about":
		return pageMeta{title: "About - " + h.config.DefaultTitle, description: h.config.DefaultDescription, h1: "About"}
	case "/contact":
		return pageMeta{title: "Contact - " + h.config.DefaultTitle, description: h.config.DefaultDescription, h1: "Contact"}
	case "/stats":
		return pageMeta{title: "Stats - " + h.config.DefaultTitle, description: h.config.DefaultDescription, h1: "Stats"}
	case "/search":
		return pageMeta{title: "Search - " + h.config.DefaultTitle, description: h.config.DefaultDescription, h1: "Search"}
	case "/requests":
		return pageMeta{title: "Requests - " + h.config.DefaultTitle, description: h.config.DefaultDescription, h1: "Requests"}
	case "/likes":
		return pageMeta{title: "Likes - " + h.config.DefaultTitle, description: h.config.DefaultDescription + " · Your liked tracks", h1: "Your likes"}
	case "/recover":
		return pageMeta{title: "Recover Likes - " + h.config.DefaultTitle, description: h.config.DefaultDescription + " · Recover your likes", h1: "Recover your likes"}
	}

	// Unknown route — return 404
	return pageMeta{
		title:       "Not Found - " + h.config.DefaultTitle,
		description: h.config.DefaultDescription,
		h1:          "Not Found",
		notFound:    true,
	}
}

func (h *SPAHandler) serveRoute(w http.ResponseWriter, r *http.Request) {
	if h.htmlTemplate == "" {
		http.Error(w, "Index not found", http.StatusNotFound)
		return
	}

	shareRow, shareLookupErr := h.audioRowForRoute(r)
	meta := h.getPageMetaWithAudio(r, shareRow)
	escapedTitle := html.EscapeString(meta.title)
	escapedDesc := html.EscapeString(meta.description)
	pageURL := html.EscapeString(siteOrigin(r) + r.URL.Path)

	ogType := meta.ogType
	if ogType == "" {
		ogType = "website"
	}

	doc := h.htmlTemplate

	doc = strings.Replace(doc, "<title>Audio Share</title>", "<title>"+escapedTitle+"</title>", 1)

	var b strings.Builder
	b.WriteString(`<meta name="description" content="` + escapedDesc + `">`)
	b.WriteString(`<meta property="og:type" content="` + ogType + `">`)
	b.WriteString(`<meta property="og:url" content="` + pageURL + `">`)
	b.WriteString(`<meta property="og:title" content="` + escapedTitle + `">`)
	b.WriteString(`<meta property="og:description" content="` + escapedDesc + `">`)
	b.WriteString(`<meta name="twitter:card" content="summary">`)
	b.WriteString(`<meta name="twitter:title" content="` + escapedTitle + `">`)
	b.WriteString(`<meta name="twitter:description" content="` + escapedDesc + `">`)
	if meta.imageURL != "" {
		escapedImage := html.EscapeString(meta.imageURL)
		b.WriteString(`<meta property="og:image" content="` + escapedImage + `">`)
		b.WriteString(`<meta name="twitter:image" content="` + escapedImage + `">`)
		b.WriteString(`<meta name="twitter:card" content="summary_large_image">`)
	}

	doc = strings.Replace(doc, "</head>", b.String()+"</head>", 1)

	snapshot, initialData := h.renderPageSnapshot(r, meta, shareRow, shareLookupErr)
	doc = strings.Replace(doc, `<div id="root"></div>`, `<div id="root">`+snapshot+`</div>`, 1)
	if initialData != "" {
		doc = strings.Replace(doc, "</head>", initialData+"</head>", 1)
	}

	cacheControl := "no-cache"
	if shareRow != nil && shareRow.removalRequestedAt.Valid {
		cacheControl = "private, no-store"
	}
	w.Header().Set("Cache-Control", cacheControl)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if meta.notFound {
		w.WriteHeader(http.StatusNotFound)
	}
	w.Write([]byte(doc))
}
