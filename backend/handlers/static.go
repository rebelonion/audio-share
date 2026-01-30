package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

type FrontendConfig struct {
	DefaultTitle       string `json:"defaultTitle,omitempty"`
	DefaultDescription string `json:"defaultDescription,omitempty"`
	UmamiURL           string `json:"umamiUrl,omitempty"`
	UmamiWebsiteID     string `json:"umamiWebsiteId,omitempty"`
}

type SPAHandler struct {
	staticDir    string
	indexPath    string
	indexContent []byte
}

func NewSPAHandler(staticDir string, config FrontendConfig) *SPAHandler {
	cleanDir := filepath.Clean(staticDir)
	indexPath := filepath.Join(cleanDir, "index.html")

	var indexContent []byte
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

		indexContent = []byte(strings.Replace(string(data), "</head>", configScript+ldScript+"</head>", 1))
	}

	return &SPAHandler{
		staticDir:    cleanDir,
		indexPath:    indexPath,
		indexContent: indexContent,
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
		h.serveIndex(w)
		return
	}

	if filepath.Base(fullPath) == "index.html" {
		h.serveIndex(w)
		return
	}

	http.ServeFile(w, r, fullPath)
}

func (h *SPAHandler) serveIndex(w http.ResponseWriter) {
	if h.indexContent != nil {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(h.indexContent)
	} else {
		http.Error(w, "Index not found", http.StatusNotFound)
	}
}
