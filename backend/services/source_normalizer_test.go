package services

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func writeNormalizerTestScript(t *testing.T, source string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "normalizer.py")
	if err := os.WriteFile(path, []byte(source), 0o600); err != nil {
		t.Fatalf("write normalizer script: %v", err)
	}
	return path
}

func TestScriptSourceNormalizerSuccess(t *testing.T) {
	script := writeNormalizerTestScript(t, `
import json, sys
payload = json.load(sys.stdin)
assert payload["url"] == "https://m.youtube.com/@example"
print(json.dumps({
    "sourceKey": "youtube:UC123",
    "canonicalUrl": "https://www.youtube.com/channel/UC123",
    "platform": "youtube",
    "title": "Example"
}))
`)
	normalizer := NewScriptSourceNormalizer(script, time.Second)

	result, err := normalizer.Normalize(context.Background(), "https://m.youtube.com/@example")
	if err != nil {
		t.Fatalf("Normalize returned error: %v", err)
	}
	if result.SourceKey != "youtube:UC123" {
		t.Fatalf("source key = %q", result.SourceKey)
	}
	if result.CanonicalURL != "https://www.youtube.com/channel/UC123" {
		t.Fatalf("canonical URL = %q", result.CanonicalURL)
	}
}

func TestScriptSourceNormalizerReturnsStructuredError(t *testing.T) {
	script := writeNormalizerTestScript(t, `
import json, sys
print(json.dumps({"error": {
    "code": "unsupported_platform",
    "message": "Please enter a supported creator URL."
}}))
sys.exit(2)
`)
	normalizer := NewScriptSourceNormalizer(script, time.Second)

	_, err := normalizer.Normalize(context.Background(), "https://example.com/creator")
	var normalizationError *SourceNormalizationError
	if !errors.As(err, &normalizationError) {
		t.Fatalf("error = %v, want SourceNormalizationError", err)
	}
	if normalizationError.Code != "unsupported_platform" {
		t.Fatalf("error code = %q", normalizationError.Code)
	}
}
