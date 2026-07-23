package handlers

import "testing"

func TestNormalizePlaybackOrigin(t *testing.T) {
	for _, origin := range []string{"browse", "share", "home", "search", "likes", "manual", "autoplay"} {
		if got := normalizePlaybackOrigin(origin); got != origin {
			t.Errorf("normalizePlaybackOrigin(%q) = %q", origin, got)
		}
	}
	for _, origin := range []string{"", "admin", "a very long arbitrary value"} {
		if got := normalizePlaybackOrigin(origin); got != "unknown" {
			t.Errorf("normalizePlaybackOrigin(%q) = %q, want unknown", origin, got)
		}
	}
}
