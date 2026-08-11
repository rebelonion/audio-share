package handlers

import (
	"encoding/json"
	"net/http"
	"net/url"
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

func isRootSlug(value string) bool {
	if value == "" {
		return false
	}
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
			continue
		}
		return false
	}
	return true
}

type SearchResponse struct {
	Results []services.SearchResult `json:"results"`
	Query   string                  `json:"query"`
	Count   int                     `json:"count"`
	Total   int                     `json:"total"`
	Offset  int                     `json:"offset"`
	Limit   int                     `json:"limit"`
}

const maxSearchLimit = 50

type searchExecutor interface {
	Search(string, int, int, services.SearchOptions) ([]services.SearchResult, int, error)
}

func searchResponseForValues(service searchExecutor, values url.Values) (SearchResponse, error) {
	query := values.Get("q")
	root := strings.Trim(strings.TrimSpace(values.Get("root")), "/")
	hasRootFilter := isRootSlug(root)

	hasFilters := values.Get("type") != "" ||
		values.Get("unavailableOnly") == "true" ||
		values.Get("sort") != "" ||
		values.Get("dateFrom") != "" ||
		values.Get("dateTo") != "" ||
		values.Get("durationMin") != "" ||
		values.Get("durationMax") != "" ||
		values.Get("fields") != "" ||
		values.Get("includeMature") == "true" ||
		hasRootFilter

	if len(query) < 2 && !hasFilters {
		return SearchResponse{
			Results: []services.SearchResult{},
			Query:   query,
			Count:   0,
			Total:   0,
			Offset:  0,
			Limit:   maxSearchLimit,
		}, nil
	}

	limit := maxSearchLimit
	if limitStr := values.Get("limit"); limitStr != "" {
		if parsed, err := strconv.Atoi(limitStr); err == nil && parsed > 0 {
			limit = min(parsed, maxSearchLimit)
		}
	}

	offset := 0
	if offsetStr := values.Get("offset"); offsetStr != "" {
		if parsed, err := strconv.Atoi(offsetStr); err == nil && parsed >= 0 {
			offset = parsed
		}
	}

	opts := services.SearchOptions{}
	if value := values.Get("type"); value == "audio" || value == "folder" {
		opts.Type = value
	}
	if values.Get("unavailableOnly") == "true" {
		opts.UnavailableOnly = true
	}
	if values.Get("includeMature") == "true" {
		opts.IncludeMature = true
	}
	if value := values.Get("sort"); value != "" {
		opts.Sort = value
	}
	opts.DateFrom = values.Get("dateFrom")
	opts.DateTo = values.Get("dateTo")
	if value := values.Get("durationMin"); value != "" {
		if parsed, err := strconv.ParseFloat(value, 64); err == nil && parsed > 0 {
			opts.DurationMin = parsed
		}
	}
	if value := values.Get("durationMax"); value != "" {
		if parsed, err := strconv.ParseFloat(value, 64); err == nil && parsed > 0 {
			opts.DurationMax = parsed
		}
	}
	if value := values.Get("fields"); value != "" {
		validFields := map[string]bool{"filename": true, "title": true, "artist": true, "description": true}
		for _, field := range strings.Split(value, ",") {
			field = strings.TrimSpace(field)
			if validFields[field] {
				opts.Fields = append(opts.Fields, field)
			}
		}
	}
	if hasRootFilter {
		opts.Root = root
	}

	results, total, err := service.Search(query, limit, offset, opts)
	if err != nil {
		return SearchResponse{}, err
	}
	if results == nil {
		results = []services.SearchResult{}
	}
	return SearchResponse{
		Results: results,
		Query:   query,
		Count:   len(results),
		Total:   total,
		Offset:  offset,
		Limit:   limit,
	}, nil
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

	response, err := searchResponseForValues(h.searchService, r.URL.Query())
	if err != nil {
		http.Error(w, "Search error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
