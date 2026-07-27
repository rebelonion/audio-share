package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSecurityHeadersAllowConfiguredCapOriginAndBlobWorkers(t *testing.T) {
	handler := NewSecurityHeaders(
		"https://analytics.example.test/script.js",
		"https://captcha.example.test/api/",
	).Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "https://audio.example.test/", nil))

	csp := recorder.Header().Get("Content-Security-Policy")
	for _, directive := range []string{
		"connect-src 'self' https://analytics.example.test https://captcha.example.test;",
		"worker-src 'self' blob:;",
	} {
		if !strings.Contains(csp, directive) {
			t.Fatalf("CSP %q does not contain %q", csp, directive)
		}
	}
}
