package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
)

type ContentHandler struct {
	contentDir string
}

func NewContentHandler(contentDir string) *ContentHandler {
	return &ContentHandler{contentDir: contentDir}
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
