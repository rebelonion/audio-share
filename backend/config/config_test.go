package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestEnvFileDoesNotOverrideExplicitlyDisabledSchedule(t *testing.T) {
	t.Setenv("INDEX_SCHEDULE", "")
	path := filepath.Join(t.TempDir(), "worker.env")
	if err := os.WriteFile(path, []byte("INDEX_SCHEDULE=* * * * *\n"), 0600); err != nil {
		t.Fatal(err)
	}
	loadEnvFile(path)
	if got := Load().IndexSchedule; got != "" {
		t.Fatalf("disabled schedule was re-enabled: %q", got)
	}
}

func TestAdminSessionTTLConfiguration(t *testing.T) {
	t.Setenv("ADMIN_SESSION_TTL", "")
	if got := Load().AdminSessionTTL; got != "8h" {
		t.Fatalf("default=%q", got)
	}
	t.Setenv("ADMIN_SESSION_TTL", "45m")
	if got := Load().AdminSessionTTL; got != "45m" {
		t.Fatalf("override=%q", got)
	}
}
