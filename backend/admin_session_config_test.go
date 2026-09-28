package main

import (
	"strings"
	"testing"

	"github.com/onion/audio-share-backend/config"
)

func TestAdminSessionTTLRejectsInvalidDurations(t *testing.T) {
	for _, value := range []string{"", "invalid", "0s", "-1h", "500ms", "1.5s"} {
		cfg := &config.Config{SessionSecret: "test", AdminSessionTTL: value}
		_, err := appHandler(cfg, nil, nil, nil)
		if err == nil || !strings.Contains(err.Error(), "ADMIN_SESSION_TTL") {
			t.Fatalf("value=%q error=%v", value, err)
		}
	}
}
