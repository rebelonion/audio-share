package clientip

import (
	"net/http/httptest"
	"testing"
)

func TestResolve(t *testing.T) {
	for _, tc := range []struct {
		name, trusted, header, remote string
		headers                       map[string]string
		want                          string
		unknown                       bool
	}{
		{name: "direct connection", trusted: "private", remote: "192.0.2.4:1234", want: "192.0.2.4"},
		{name: "connection without port", trusted: "private", remote: "192.0.2.4", want: "192.0.2.4"},
		{name: "IPv6 connection", trusted: "private", remote: "[2001:db8::1]:1234", want: "2001:db8::1"},
		{name: "IPv4-mapped connection", trusted: "private", remote: "[::ffff:192.0.2.4]:1234", want: "192.0.2.4"},
		{
			name: "untrusted peer cannot forward", trusted: "private", remote: "203.0.113.8:1234",
			headers: map[string]string{"X-Forwarded-For": "127.0.0.1", "CF-Connecting-IP": "127.0.0.1", "X-Real-IP": "127.0.0.1"},
			want:    "203.0.113.8",
		},
		{
			name: "nothing trusted", trusted: "none", remote: "127.0.0.1:1234",
			headers: map[string]string{"X-Forwarded-For": "192.0.2.3"},
			want:    "127.0.0.1",
		},
		{
			name: "forwarded client", trusted: "private", remote: "172.18.0.2:1234",
			headers: map[string]string{"X-Forwarded-For": "192.0.2.3"},
			want:    "192.0.2.3",
		},
		{
			name: "spoofed forwarded prefix is ignored", trusted: "private", remote: "172.18.0.2:1234",
			headers: map[string]string{"X-Forwarded-For": "127.0.0.1, 192.0.2.3"},
			want:    "192.0.2.3",
		},
		{
			name: "multiple trusted hops", trusted: "private,198.51.100.0/24", remote: "127.0.0.1:1234",
			headers: map[string]string{"X-Forwarded-For": "203.0.113.9, 192.0.2.3, 198.51.100.7, 10.0.0.1"},
			want:    "192.0.2.3",
		},
		{
			name: "all hops trusted", trusted: "private", remote: "172.18.0.2:1234",
			headers: map[string]string{"X-Forwarded-For": "10.0.0.9, 172.18.0.2"},
			want:    "10.0.0.9",
		},
		{
			name: "malformed hop stops the walk", trusted: "private", remote: "172.18.0.2:1234",
			headers: map[string]string{"X-Forwarded-For": "192.0.2.3, not-an-ip"},
			want:    "172.18.0.2",
			unknown: true,
		},
		{
			name: "malformed hop before trusted hop", trusted: "private", remote: "172.18.0.2:1234",
			headers: map[string]string{"X-Forwarded-For": "not-an-ip, 10.0.0.1"},
			want:    "172.18.0.2", unknown: true,
		},
		{
			name: "malformed prefix beyond untrusted hop ignored", trusted: "private", remote: "172.18.0.2:1234",
			headers: map[string]string{"X-Forwarded-For": "not-an-ip, 192.0.2.3"},
			want:    "192.0.2.3",
		},
		{
			name: "missing forwarded header", trusted: "private", remote: "127.0.0.1:1234",
			want: "127.0.0.1", unknown: true,
		},
		{
			name: "invalid peer", trusted: "private", remote: "not-an-ip",
			want: "not-an-ip", unknown: true,
		},
		{
			name: "forwarded IPv6", trusted: "private", remote: "[::1]:1234",
			headers: map[string]string{"X-Forwarded-For": "2001:db8::1"},
			want:    "2001:db8::1",
		},
		{
			name: "single trusted address", trusted: "198.51.100.7", remote: "198.51.100.7:1234",
			headers: map[string]string{"X-Forwarded-For": "192.0.2.3"},
			want:    "192.0.2.3",
		},
		{
			name: "Cloudflare header", trusted: "private", header: "CF-Connecting-IP", remote: "127.0.0.1:1234",
			headers: map[string]string{"CF-Connecting-IP": "192.0.2.1", "X-Forwarded-For": "192.0.2.3"},
			want:    "192.0.2.1",
		},
		{
			name: "missing configured header", trusted: "private", header: "X-Real-IP", remote: "127.0.0.1:1234",
			headers: map[string]string{"X-Forwarded-For": "192.0.2.3"},
			want:    "127.0.0.1",
			unknown: true,
		},
		{
			name: "malformed real IP", trusted: "private", header: "X-Real-IP", remote: "127.0.0.1:1234",
			headers: map[string]string{"X-Real-IP": "not-an-ip"},
			want:    "127.0.0.1", unknown: true,
		},
		{
			name: "malformed Cloudflare IP", trusted: "private", header: "CF-Connecting-IP", remote: "127.0.0.1:1234",
			headers: map[string]string{"CF-Connecting-IP": "not-an-ip"},
			want:    "127.0.0.1", unknown: true,
		},
		{
			name: "unconfigured header is ignored", trusted: "private", remote: "127.0.0.1:1234",
			headers: map[string]string{"CF-Connecting-IP": "192.0.2.1"},
			want:    "127.0.0.1",
			unknown: true,
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			resolver, err := New(tc.trusted, tc.header)
			if err != nil {
				t.Fatal(err)
			}
			r := httptest.NewRequest("GET", "/", nil)
			r.RemoteAddr = tc.remote
			for name, value := range tc.headers {
				r.Header.Set(name, value)
			}
			if got := resolver.Resolve(r); got != tc.want {
				t.Fatalf("Resolve() = %q, want %q", got, tc.want)
			}
			if got := FromRequest(resolver.Attach(r)); got != tc.want {
				t.Fatalf("FromRequest(Attach()) = %q, want %q", got, tc.want)
			}
			if got := ClientKnown(resolver.Attach(r)); got != !tc.unknown {
				t.Fatalf("ClientKnown(Attach()) = %v, want %v", got, !tc.unknown)
			}
		})
	}
}

func TestFromRequestWithoutResolverIgnoresHeaders(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "127.0.0.1:1234"
	r.Header.Set("CF-Connecting-IP", "192.0.2.1")
	r.Header.Set("X-Forwarded-For", "192.0.2.3")
	if got := FromRequest(r); got != "127.0.0.1" {
		t.Fatalf("FromRequest() = %q, want peer address", got)
	}
}

func TestNewRejectsInvalidConfiguration(t *testing.T) {
	if _, err := New("private", "Forwarded"); err == nil {
		t.Fatal("unsupported header accepted")
	}
	if _, err := New("private,not-a-network", ""); err == nil {
		t.Fatal("invalid proxy entry accepted")
	}
}
