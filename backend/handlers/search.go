package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/onion/audio-share-backend/services"
)

type SearchHandler struct {
	searchService *services.SearchService
}

func NewSearchHandler(searchService *services.SearchService) *SearchHandler {
	return &SearchHandler{searchService: searchService}
}

type SearchResponse struct {
	Results []services.SearchResult `json:"results"`
	Query   string                  `json:"query"`
	Count   int                     `json:"count"`
	Total   int                     `json:"total"`
	Offset  int                     `json:"offset"`
	Limit   int                     `json:"limit"`
}

func (h *SearchHandler) RandomHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		shareKey, err := h.searchService.RandomAudio()
		if err != nil {
			http.Error(w, "No audio found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"shareKey": shareKey})
	}
}

func (h *SearchHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	query := r.URL.Query().Get("q")

	hasFilters := r.URL.Query().Get("type") != "" ||
		r.URL.Query().Get("unavailableOnly") == "true" ||
		r.URL.Query().Get("sort") != "" ||
		r.URL.Query().Get("dateFrom") != "" ||
		r.URL.Query().Get("dateTo") != "" ||
		r.URL.Query().Get("durationMin") != "" ||
		r.URL.Query().Get("durationMax") != "" ||
		r.URL.Query().Get("fields") != ""

	if len(query) < 2 && !hasFilters {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(SearchResponse{
			Results: []services.SearchResult{},
			Query:   query,
			Count:   0,
			Total:   0,
			Offset:  0,
			Limit:   50,
		})
		return
	}

	limit := 50
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if parsed, err := strconv.Atoi(limitStr); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	offset := 0
	if offsetStr := r.URL.Query().Get("offset"); offsetStr != "" {
		if parsed, err := strconv.Atoi(offsetStr); err == nil && parsed >= 0 {
			offset = parsed
		}
	}

	opts := services.SearchOptions{}

	if t := r.URL.Query().Get("type"); t == "audio" || t == "folder" {
		opts.Type = t
	}

	if r.URL.Query().Get("unavailableOnly") == "true" {
		opts.UnavailableOnly = true
	}

	if s := r.URL.Query().Get("sort"); s != "" {
		opts.Sort = s
	}

	opts.DateFrom = r.URL.Query().Get("dateFrom")
	opts.DateTo = r.URL.Query().Get("dateTo")

	if v := r.URL.Query().Get("durationMin"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f > 0 {
			opts.DurationMin = f
		}
	}
	if v := r.URL.Query().Get("durationMax"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f > 0 {
			opts.DurationMax = f
		}
	}

	if v := r.URL.Query().Get("fields"); v != "" {
		validFields := map[string]bool{"filename": true, "title": true, "artist": true, "description": true}
		for _, f := range strings.Split(v, ",") {
			f = strings.TrimSpace(f)
			if validFields[f] {
				opts.Fields = append(opts.Fields, f)
			}
		}
	}

	results, total, err := h.searchService.Search(query, limit, offset, opts)
	if err != nil {
		http.Error(w, "Search error", http.StatusInternalServerError)
		return
	}

	if results == nil {
		results = []services.SearchResult{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(SearchResponse{
		Results: results,
		Query:   query,
		Count:   len(results),
		Total:   total,
		Offset:  offset,
		Limit:   limit,
	})
}
