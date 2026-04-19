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
	RybbitURL    string `json:"rybbitUrl,omitempty"`
	RybbitSiteID string `json:"rybbitSiteId,omitempty"`
}

type SPAHandler struct {
	staticDir    string
	htmlTemplate string
	db           *sql.DB
	config       FrontendConfig
}

func NewSPAHandler(staticDir string, config FrontendConfig, db *sql.DB) *SPAHandler {
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

		// Store template with config/ld+json injected but without title or meta tags;
		// those are injected per-request in serveRoute.
		htmlTemplate = strings.Replace(string(data), "</head>", configScript+ldScript+"</head>", 1)
	}

	return &SPAHandler{
		staticDir:    cleanDir,
		htmlTemplate: htmlTemplate,
		db:           db,
		config:       config,
	}
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

	http.ServeFile(w, r, fullPath)
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

func (h *SPAHandler) getPageMeta(r *http.Request) pageMeta {
	urlPath := r.URL.Path
	origin := siteOrigin(r)

	// /share/:key — look up audio metadata from DB
	if strings.HasPrefix(urlPath, "/share/") {
		key := strings.Trim(strings.TrimPrefix(urlPath, "/share/"), "/")
		if key != "" && h.db != nil {
			var title, artist, thumbnail sql.NullString
			err := h.db.QueryRow(`
				SELECT title, meta_artist, thumbnail
				FROM audio_files WHERE share_key = $1 AND deleted = 0
			`, key).Scan(&title, &artist, &thumbnail)
			if err == nil {
				t := h.config.DefaultTitle
				if title.Valid && title.String != "" {
					t = title.String
				}
				if artist.Valid && artist.String != "" {
					t = t + " by " + artist.String
				}
				desc := h.config.DefaultDescription + " — " + t
				imageURL := ""
				if thumbnail.Valid && thumbnail.String != "" {
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
		}
	}

	// /browse/* — use the last path segment as folder name
	if strings.HasPrefix(urlPath, "/browse") {
		pathStr := strings.Trim(strings.TrimPrefix(urlPath, "/browse"), "/")
		folderName := "Root"
		if pathStr != "" {
			segments := strings.Split(pathStr, "/")
			folderName = segments[len(segments)-1]
		}
		return pageMeta{
			title:       folderName + " - " + h.config.DefaultTitle,
			description: h.config.DefaultDescription + " — Browse " + folderName,
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

	meta := h.getPageMeta(r)
	escapedTitle := html.EscapeString(meta.title)
	escapedDesc := html.EscapeString(meta.description)
	escapedH1 := html.EscapeString(meta.h1)
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

	srH1 := `<h1 aria-hidden="true" style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0">` + escapedH1 + `</h1>`
	doc = strings.Replace(doc, `<div id="root"></div>`, srH1+`<div id="root"></div>`, 1)

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if meta.notFound {
		w.WriteHeader(http.StatusNotFound)
	}
	w.Write([]byte(doc))
}
