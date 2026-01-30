package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

type ContentHandler struct {
	contentDir string
	title      string
}

func NewContentHandler(contentDir string, title string) *ContentHandler {
	return &ContentHandler{contentDir: contentDir, title: title}
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
	paths := []string{"/", "/about", "/contact", "/stats"}

	return func(w http.ResponseWriter, r *http.Request) {
		scheme := "https"
		if fwdProto := r.Header.Get("X-Forwarded-Proto"); fwdProto != "" {
			scheme = fwdProto
		} else if r.TLS == nil && !strings.HasPrefix(r.Host, "localhost") {
			scheme = "http"
		}
		baseURL := scheme + "://" + r.Host

		var b strings.Builder
		b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>`)
		b.WriteString("\n")
		b.WriteString(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`)
		b.WriteString("\n")
		for _, p := range paths {
			fmt.Fprintf(&b, "  <url><loc>%s%s</loc></url>\n", baseURL, p)
		}
		b.WriteString("</urlset>\n")

		w.Header().Set("Content-Type", "application/xml; charset=utf-8")
		w.Write([]byte(b.String()))
	}
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

		result := make(map[string]interface{})

		audioPath := filepath.Join(h.contentDir, "audio_by_day.json")
		if audioData, err := os.ReadFile(audioPath); err == nil {
			var audio interface{}
			if json.Unmarshal(audioData, &audio) == nil {
				result["audio"] = audio
			}
		}

		sourcesPath := filepath.Join(h.contentDir, "sources_by_day.json")
		if sourcesData, err := os.ReadFile(sourcesPath); err == nil {
			var sources interface{}
			if json.Unmarshal(sourcesData, &sources) == nil {
				result["sources"] = sources
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	}
}
