package services

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"unicode/utf8"
)

func TestCredentialRedaction(t *testing.T) {
	fixtures := []struct{ Input, Expected string }{
		{"password=\"two secret words\" failed", "password=[redacted] failed"},
		{"password='two secret words' failed", "password=[redacted] failed"},
		{"password=\"two \\\"secret\\\" words\" failed", "password=[redacted] failed"},
		{"password=\"unterminated secret words", "password=[redacted]"},
		{"Authorization: Basic dXNlcjpwYXNz\nrequest failed", "Authorization: [redacted]\nrequest failed"},
		{"Authorization: Digest username=\"alice\", response=\"private\"", "Authorization: [redacted]"},
		{"Proxy-Authorization: Bearer private-token", "Proxy-Authorization: [redacted]"},
		{"Cookie: session=private; another=private", "Cookie: [redacted]"},
		{"accessKey=private recoveryKey=private capToken=private", "accessKey=[redacted] recoveryKey=[redacted] capToken=[redacted]"},
		{"access_key=private recovery-key=private API_KEY=private", "access_key=[redacted] recovery-key=[redacted] API_KEY=[redacted]"},
		{"{\"accessKey\":\"two secret words\",\"recoveryKey\":\"private\"}", "{\"accessKey\":[redacted],\"recoveryKey\":[redacted]}"},
		{"Basic dXNlcjpwYXNz Bearer private-token", "Basic [redacted] Bearer [redacted]"},
		{"refreshToken=private sessionSecret=private clientSecret=private", "refreshToken=[redacted] sessionSecret=[redacted] clientSecret=[redacted]"},
		{"open source/poster.jpg: permission denied", "open source/poster.jpg: permission denied"},
	}
	for _, fixture := range fixtures {
		if got := DiagnosticText(fixture.Input, 1000); got != fixture.Expected {
			t.Errorf("input %q: got %q, want %q", fixture.Input, got, fixture.Expected)
		}
	}
}

func TestDiagnosticContextRedactionAndBounds(t *testing.T) {
	input := "https://alice:private-password@example.com/audio/key/track?token=private-query#private-fragment password=private-value Bearer private-bearer {\"token\":\"private-json\"}\x00"
	got := DiagnosticText(input, 1000)
	if strings.Contains(got, "private-") || strings.Contains(got, "\x00") || !strings.Contains(got, "/audio/key/track") {
		t.Fatalf("unexpected redaction: %s", got)
	}
	long := DiagnosticText(strings.Repeat("界", 1000), 100)
	if len(long) > 103 || !utf8.ValidString(long) {
		t.Fatalf("invalid truncation: %q", long)
	}
	context := ErrorContext{Stack: strings.Repeat("s", 4000)}
	for range 10 {
		context.Failures = append(context.Failures, ErrorContext{Message: input, Failures: []ErrorContext{{Message: input}}})
	}
	safe := context.sanitized()
	if len(safe.Failures) != 5 || len(safe.Stack) > 3003 || len(safe.Failures[0].Failures) != 0 {
		t.Fatalf("unbounded context: %+v", safe)
	}
}

func TestDiagnosticContextPreservesFilePaths(t *testing.T) {
	for _, path := range []string{
		"/mnt/asmr/ささがにえんも Enmo Ch#/【 雑談ASMR配信 】耳元でおしゃべりするよ。【 ささがにえんも ⧸ Vtuber 】 [XzV8iu-5VG4].jpg",
		"source/cover?original#1.jpg",
	} {
		t.Run(path, func(t *testing.T) {
			details := ErrorDetails(&fs.PathError{Op: "stat", Path: path, Err: fs.ErrNotExist})
			details.Route = "/api/audio/key/track/thumbnail?arbitrary=private-query#private-fragment"
			details.Endpoint = "/api/artwork#private-fragment"
			safe := details.sanitized()
			if safe.Resource != path || safe.Message != "stat "+path+": "+fs.ErrNotExist.Error() {
				t.Fatalf("file path changed: %+v", safe)
			}
			if safe.Route != "/api/audio/key/track/thumbnail" || safe.Endpoint != "/api/artwork" {
				t.Fatalf("URL fields not redacted: %+v", safe)
			}
			raw, err := json.Marshal(safe)
			if err != nil {
				t.Fatal(err)
			}
			summary := diagnosticSummary(raw)
			if !strings.Contains(summary, "Resource: "+path) || !strings.Contains(summary, "Error: "+safe.Message) || strings.Contains(summary, "private-") {
				t.Fatalf("bad alert summary: %s", summary)
			}
		})
	}
}

func TestFileErrorContextDistinguishesPermissions(t *testing.T) {
	for _, tc := range []struct {
		err   error
		cause string
	}{{fs.ErrNotExist, "missing-file"}, {fs.ErrPermission, "io"}, {nil, "io"}} {
		event := ErrorEvent{}
		AnnotateFileError(WithRequestError(context.Background(), &event), tc.err, "source/poster.jpg", "degraded")
		if event.Cause != tc.cause || event.Context.Resource != "source/poster.jpg" || event.Context.Message == "" {
			t.Fatalf("missing context: %+v", event)
		}
	}
}

func TestFailureExamplesBoundedAndConcurrent(t *testing.T) {
	var examples FailureExamples
	var wg sync.WaitGroup
	for i := range 20 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			examples.Add("ffprobe", fmt.Sprintf("track-%d", i), fmt.Errorf("exit status 1"))
		}()
	}
	wg.Wait()
	got := examples.Context()
	if len(got.Failures) != 5 || got.FailureCounts["ffprobe"] != 20 {
		t.Fatalf("wrong samples/count: %+v", got)
	}
}

func TestIntegrationErrorContextPersistsAndAppearsInAlerts(t *testing.T) {
	db := integrationDatabase(t)
	if err := db.Migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	bodies := make(chan string, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		bodies <- string(body)
		w.WriteHeader(200)
	}))
	defer server.Close()
	policy := testErrorPolicy()
	policy.ServerCount = 1
	reporter := NewErrorReporter(db.DB(), "build", policy, NewNtfyService(server.URL, "errors", "", 3, ""))
	for i := range 3 {
		event := ErrorEvent{Operation: "artwork", Method: "GET", Stage: "read", Cause: "missing-file", Outcome: "degraded", Status: 404,
			Context: ErrorContext{Route: fmt.Sprintf("/api/audio/key/track-%d/thumbnail?token=private-secret", i), Resource: fmt.Sprintf("source/poster-%d.jpg", i), Message: "open: no such file", Stack: "example stack"}}
		if err := reporter.Record(context.Background(), "server", "", event); err != nil {
			t.Fatal(err)
		}
	}
	var groups, ids int
	if err := db.DB().QueryRow(`SELECT COUNT(DISTINCT fingerprint), COUNT(DISTINCT event_id) FROM error_reports`).Scan(&groups, &ids); err != nil {
		t.Fatal(err)
	}
	if groups != 1 || ids != 3 {
		t.Fatalf("grouping changed: groups=%d ids=%d", groups, ids)
	}
	var raw []byte
	if err := db.DB().QueryRow(`SELECT context FROM error_reports LIMIT 1`).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var details ErrorContext
	if err := json.Unmarshal(raw, &details); err != nil {
		t.Fatal(err)
	}
	if details.Stack != "example stack" || strings.Contains(string(raw), "private-secret") {
		t.Fatalf("bad stored context: %s", raw)
	}
	if err := reporter.Process(); err != nil {
		t.Fatal(err)
	}
	select {
	case body := <-bodies:
		if strings.Count(body, "Event:") != 2 || !strings.Contains(body, "poster-") || !strings.Contains(body, "open: no such file") || strings.Contains(body, "private-secret") || len(body) > 4096 {
			t.Fatalf("bad alert: %s", body)
		}
	default:
		t.Fatal("no alert delivered")
	}
}
