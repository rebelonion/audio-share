package middleware

import (
	"net/http"
	"net/url"
)

type SecurityHeaders struct {
	rybbitDomain string
	capDomain    string
}

func NewSecurityHeaders(rybbitURL, capURL string) *SecurityHeaders {
	return &SecurityHeaders{
		rybbitDomain: origin(rybbitURL),
		capDomain:    origin(capURL),
	}
}

func origin(rawURL string) string {
	if rawURL == "" {
		return ""
	}
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return ""
	}
	return parsed.Scheme + "://" + parsed.Host
}

func (s *SecurityHeaders) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Build CSP
		scriptSrc := "'self' 'unsafe-inline' 'unsafe-eval'"
		connectSrc := "'self'"
		if s.rybbitDomain != "" {
			scriptSrc += " " + s.rybbitDomain
			connectSrc += " " + s.rybbitDomain
		}
		if s.capDomain != "" && s.capDomain != s.rybbitDomain {
			connectSrc += " " + s.capDomain
		}

		csp := "default-src 'self'; " +
			"script-src " + scriptSrc + "; " +
			"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
			"img-src 'self' data: blob:; " +
			"media-src 'self' blob:; " +
			"connect-src " + connectSrc + "; " +
			"font-src 'self' https://fonts.gstatic.com; " +
			"worker-src 'self' blob:; " +
			"object-src 'none'; " +
			"base-uri 'self'; " +
			"form-action 'self'; " +
			"frame-ancestors 'none'; " +
			"block-all-mixed-content;"

		w.Header().Set("Content-Security-Policy", csp)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

		next.ServeHTTP(w, r)
	})
}
