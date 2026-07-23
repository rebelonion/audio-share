package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCORSMiddlewareAllowsPut(t *testing.T) {
	handler := corsMiddleware([]string{"https://frontend.example"}, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	request := httptest.NewRequest(http.MethodOptions, "https://api.example/api/likes/track", nil)
	request.Header.Set("Origin", "https://frontend.example")
	request.Header.Set("Access-Control-Request-Method", http.MethodPut)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	allowed := recorder.Header().Get("Access-Control-Allow-Methods")
	if !strings.Contains(allowed, http.MethodPut) {
		t.Fatalf("PUT missing from Access-Control-Allow-Methods: %q", allowed)
	}
}
