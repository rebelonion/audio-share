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
		"connect-src 'self' https://pagead2.googlesyndication.com https://analytics.example.test https://captcha.example.test;",
		"worker-src 'self' blob:;",
	} {
		if !strings.Contains(csp, directive) {
			t.Fatalf("CSP %q does not contain %q", csp, directive)
		}
	}
}

func TestSecurityHeadersRybbitOrigin(t *testing.T) {
	for _, tc := range []struct {
		name, scriptSrc, scriptDirective, connectDirective string
	}{
		{
			name:             "absolute",
			scriptSrc:        "https://rybbit.example.test/api/script.js",
			scriptDirective:  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://rybbit.example.test;",
			connectDirective: "connect-src 'self' https://pagead2.googlesyndication.com https://rybbit.example.test;",
		},
		{
			name:             "root-relative",
			scriptSrc:        "/_r/script.js",
			scriptDirective:  "script-src 'self' 'unsafe-inline' 'unsafe-eval';",
			connectDirective: "connect-src 'self' https://pagead2.googlesyndication.com;",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			handler := NewSecurityHeaders(tc.scriptSrc, "").Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(http.StatusNoContent)
			}))
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "https://audio.example.test/", nil))

			csp := recorder.Header().Get("Content-Security-Policy")
			for _, directive := range []string{tc.scriptDirective, tc.connectDirective} {
				if !strings.Contains(csp, directive) {
					t.Fatalf("CSP %q does not contain %q", csp, directive)
				}
			}
		})
	}
}
