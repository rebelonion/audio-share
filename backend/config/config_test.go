package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestEnvFileDoesNotOverrideExplicitlyDisabledSchedule(t *testing.T) {
	t.Setenv("INDEX_SCHEDULE", "")
	path := filepath.Join(t.TempDir(), "worker.env")
	if err := os.WriteFile(path, []byte("INDEX_SCHEDULE=* * * * *\n"), 0600); err != nil {
		t.Fatal(err)
	}
	loadEnvFile(path)
	if got := mustLoad(t).IndexSchedule; got != "" {
		t.Fatalf("disabled schedule was re-enabled: %q", got)
	}
}

func TestRybbitScriptSrc(t *testing.T) {
	t.Setenv("RYBBIT_URL", "")
	t.Setenv("RYBBIT_SCRIPT_SRC", "")
	if got := mustLoad(t).RybbitScript(); got != "" {
		t.Fatalf("unconfigured=%q", got)
	}
	t.Setenv("RYBBIT_URL", "https://rybbit.example.test")
	if got := mustLoad(t).RybbitScript(); got != "https://rybbit.example.test/api/script.js" {
		t.Fatalf("base URL=%q", got)
	}
	t.Setenv("RYBBIT_SCRIPT_SRC", "/_r/script.js")
	if got := mustLoad(t).RybbitScript(); got != "/_r/script.js" {
		t.Fatalf("override=%q", got)
	}
}

func TestAdminSessionTTLConfiguration(t *testing.T) {
	t.Setenv("ADMIN_SESSION_TTL", "")
	if got := mustLoad(t).AdminSessionTTL; got != "8h" {
		t.Fatalf("default=%q", got)
	}
	t.Setenv("ADMIN_SESSION_TTL", "45m")
	if got := mustLoad(t).AdminSessionTTL; got != "45m" {
		t.Fatalf("override=%q", got)
	}
}

func TestAdminFailureConfiguration(t *testing.T) {
	t.Setenv("ADMIN_AUTH_FAILURE_LIMIT", "")
	t.Setenv("ADMIN_AUTH_FAILURE_WINDOW", "")
	cfg := mustLoad(t)
	if cfg.AdminAuthFailureLimit != 10 || cfg.AdminAuthFailureWindow != "15m" {
		t.Fatal("incorrect admin failure defaults")
	}
	t.Setenv("ADMIN_AUTH_FAILURE_LIMIT", "3")
	t.Setenv("ADMIN_AUTH_FAILURE_WINDOW", "30s")
	cfg = mustLoad(t)
	if cfg.AdminAuthFailureLimit != 3 || cfg.AdminAuthFailureWindow != "30s" {
		t.Fatal("admin failure overrides not loaded")
	}
}

func mustLoad(t *testing.T) *Config {
	t.Helper()
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	return cfg
}

func TestMalformedIntegersAreReported(t *testing.T) {
	t.Setenv("MAX_REQUESTS_PER_WINDOW", "1OO")
	t.Setenv("STREAM_BYTES_PER_SECOND", "fast")
	t.Setenv("PORT", "")
	cfg, err := Load()
	if err == nil {
		t.Fatal("malformed integers were accepted")
	}
	for _, key := range []string{"MAX_REQUESTS_PER_WINDOW", "STREAM_BYTES_PER_SECOND"} {
		if !strings.Contains(err.Error(), key) {
			t.Errorf("error %q does not mention %s", err, key)
		}
	}
	if cfg.MaxRequestsPerWindow != 100 {
		t.Fatalf("MaxRequestsPerWindow=%d", cfg.MaxRequestsPerWindow)
	}
}
