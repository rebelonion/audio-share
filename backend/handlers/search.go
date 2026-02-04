package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

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

func (h *SearchHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	query := r.URL.Query().Get("q")
	if len(query) < 2 {
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

	results, total, err := h.searchService.Search(query, limit, offset)
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
