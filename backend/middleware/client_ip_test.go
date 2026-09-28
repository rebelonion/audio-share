package middleware

import (
	"net/http/httptest"
	"testing"
)

func TestClientIPHeaderPrecedence(t *testing.T) {
	for _, tc := range []struct{ name, cf, real, forwarded, remote, want string }{
		{"Cloudflare", "192.0.2.1", "192.0.2.2", "192.0.2.3, 10.0.0.1", "10.0.0.2:1234", "192.0.2.1"},
		{"real IP", "", "192.0.2.2", "192.0.2.3, 10.0.0.1", "10.0.0.2:1234", "192.0.2.2"},
		{"forwarded chain", "", "", " 192.0.2.3 , 10.0.0.1", "10.0.0.2:1234", "192.0.2.3"},
		{"forwarded IPv6", "", "", "2001:db8::1, 10.0.0.1", "10.0.0.2:1234", "2001:db8::1"},
		{"connection", "", "", "", "192.0.2.4:1234", "192.0.2.4"},
		{"connection without port", "", "", "", "192.0.2.4", "192.0.2.4"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest("GET", "/api/requests", nil)
			r.RemoteAddr = tc.remote
			r.Header.Set("CF-Connecting-IP", tc.cf)
			r.Header.Set("X-Real-IP", tc.real)
			r.Header.Set("X-Forwarded-For", tc.forwarded)
			if got := getClientIP(r); got != tc.want {
				t.Fatalf("got %q, want %q", got, tc.want)
			}
		})
	}
}
