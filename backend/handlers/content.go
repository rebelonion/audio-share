package handlers

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/onion/audio-share-backend/services"
)

type ContentHandler struct {
	contentDir    string
	title         string
	searchService *services.SearchService
}

func NewContentHandler(contentDir string, title string, searchService *services.SearchService) *ContentHandler {
	return &ContentHandler{contentDir: contentDir, title: title, searchService: searchService}
}

func (h *ContentHandler) AboutHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		aboutPath := filepath.Join(h.contentDir, "about.md")
		content, err := os.ReadFile(aboutPath)
		if err != nil {
			// Return default content if file doesn't exist
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{
				"content": "# About\n\nPlease create a `content/about.md` file to customize this page.",
			})
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"content": string(content),
		})
	}
}

func (h *ContentHandler) SitemapHandler() http.HandlerFunc {
	staticPaths := []string{"/", "/about", "/contact", "/stats"}

	return func(w http.ResponseWriter, r *http.Request) {
		scheme := "https"
		if fwdProto := r.Header.Get("X-Forwarded-Proto"); fwdProto != "" {
			scheme = fwdProto
		} else if r.TLS == nil && !strings.HasPrefix(r.Host, "localhost") {
			scheme = "http"
		}
		baseURL := scheme + "://" + r.Host

		folderPaths, err := h.searchService.GetAllFolderPaths()
		if err != nil {
			log.Printf("Error getting folder paths for sitemap: %v", err)
			folderPaths = nil
		}

		var b strings.Builder
		b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>`)
		b.WriteString("\n")
		b.WriteString(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`)
		b.WriteString("\n")
		for _, p := range staticPaths {
			fmt.Fprintf(&b, "  <url><loc>%s</loc></url>\n", xmlEscape(baseURL+p))
		}
		for _, p := range folderPaths {
			encoded := encodePath(p)
			fmt.Fprintf(&b, "  <url><loc>%s</loc></url>\n", xmlEscape(baseURL+"/browse/"+encoded))
		}
		b.WriteString("</urlset>\n")

		w.Header().Set("Content-Type", "application/xml; charset=utf-8")
		w.Write([]byte(b.String()))
	}
}

func xmlEscape(s string) string {
	var b strings.Builder
	xml.EscapeText(&b, []byte(s))
	return b.String()
}

func encodePath(p string) string {
	segments := strings.Split(p, "/")
	for i, s := range segments {
		segments[i] = url.PathEscape(s)
	}
	return strings.Join(segments, "/")
}

func (h *ContentHandler) ManifestHandler() http.HandlerFunc {
	type icon struct {
		Src     string `json:"src"`
		Sizes   string `json:"sizes"`
		Type    string `json:"type"`
		Purpose string `json:"purpose"`
	}

	type manifest struct {
		Name            string `json:"name"`
		ShortName       string `json:"short_name"`
		Icons           []icon `json:"icons"`
		ThemeColor      string `json:"theme_color"`
		BackgroundColor string `json:"background_color"`
		Display         string `json:"display"`
	}

	m := manifest{
		Name:      h.title,
		ShortName: h.title,
		Icons: []icon{
			{Src: "/web-app-manifest-192x192.png", Sizes: "192x192", Type: "image/png", Purpose: "maskable"},
			{Src: "/web-app-manifest-512x512.png", Sizes: "512x512", Type: "image/png", Purpose: "maskable"},
		},
		ThemeColor:      "#ffffff",
		BackgroundColor: "#ffffff",
		Display:         "standalone",
	}

	data, _ := json.MarshalIndent(m, "", "  ")

	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/manifest+json")
		w.Write(data)
	}
}

func (h *ContentHandler) StatsHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		audioStats, err := h.searchService.GetAudioStats()
		if err != nil {
			log.Printf("Error getting audio stats: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		sourcesStats, err := h.searchService.GetSourcesStats()
		if err != nil {
			log.Printf("Error getting sources stats: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		result := map[string]interface{}{
			"audio":   audioStats,
			"sources": sourcesStats,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	}
}
