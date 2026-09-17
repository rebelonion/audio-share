package services

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func testErrorPolicy() ErrorPolicy {
	return ErrorPolicy{Window: 5 * time.Minute, Cooldown: 30 * time.Minute, Retention: 7 * 24 * time.Hour, BrowserCount: 3, BrowserSources: 2, ServerCount: 2, MutationCount: 1, JobCount: 1}
}

func TestErrorPolicy(t *testing.T) {
	p := testErrorPolicy()
	for _, tc := range []struct {
		origin, operation, method string
		count, sources            int
		want                      bool
	}{
		{"browser", "captcha", "", 3, 1, false},
		{"browser", "captcha", "", 3, 2, true},
		{"browser", "likes", "GET", 1, 1, false},
		{"browser", "likes", "PUT", 1, 1, true},
		{"server", "contact", "POST", 1, 0, true},
		{"server", "search", "GET", 1, 0, false},
		{"server", "search", "GET", 2, 0, true},
		{"worker", "waveform", "", 1, 0, true},
	} {
		if got := p.exceeded(tc.origin, tc.operation, tc.method, tc.count, tc.sources); got != tc.want {
			t.Errorf("%+v: got %v", tc, got)
		}
	}
	if err := p.Validate(); err != nil {
		t.Fatal(err)
	}
	p.Retention = time.Second
	if p.Validate() == nil {
		t.Fatal("retention shorter than window accepted")
	}
}

func TestErrorDiagnosticFields(t *testing.T) {
	if SafeErrorCode("https://secret/token") != "unknown" || SafeDiagnosticLabel("secret\nheader") != "unknown" {
		t.Fatal("unsafe label accepted")
	}
	e := ErrorEvent{Operation: "captcha", Stage: "solve", Cause: "unavailable", Outcome: "blocked"}
	if !e.Valid() {
		t.Fatal("valid report rejected")
	}
	e.Operation = "captcha|page"
	if e.Valid() {
		t.Fatal("unbounded operation accepted")
	}
}

func TestIntegrationErrorAlertsThresholdCooldownAndConcurrentWorkers(t *testing.T) {
	db := integrationDatabase(t)
	if err := db.Migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	var sends atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if r.URL.Path != "/errors" || r.Header.Get("Authorization") != "Bearer test-token" || !strings.Contains(string(body), "captcha") || !strings.Contains(string(body), "distinct sources") {
			t.Errorf("unexpected notification %s", body)
		}
		sends.Add(1)
		w.WriteHeader(200)
	}))
	defer server.Close()
	reporter := NewErrorReporter(db.DB(), "server-build", testErrorPolicy(), NewNtfyService(server.URL, "errors", "test-token", 3, ""))
	record := func(id, sourceHash string) {
		t.Helper()
		e := ErrorEvent{EventID: id, Operation: "captcha", Stage: "solve", Cause: "unavailable", Outcome: "blocked", BuildID: "browser-build", Code: "network_error"}
		if err := reporter.Record(context.Background(), "browser", sourceHash, e); err != nil {
			t.Fatal(err)
		}
	}
	process := func() {
		t.Helper()
		if err := reporter.Process(); err != nil {
			t.Fatal(err)
		}
	}
	record("one", "a")
	record("two", "a")
	record("three", "a")
	process()
	if sends.Load() != 0 {
		t.Fatal("single source triggered alert")
	}
	record("four", "b")
	record("four", "b")
	var count int
	if err := db.DB().QueryRow(`SELECT COUNT(*) FROM error_reports`).Scan(&count); err != nil || count != 4 {
		t.Fatalf("dedup count=%d err=%v", count, err)
	}
	var wg sync.WaitGroup
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := reporter.Process(); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if sends.Load() != 1 {
		t.Fatalf("concurrent sends %d", sends.Load())
	}
	for i := range 3 {
		record(fmt.Sprint("next", i), fmt.Sprint(i))
	}
	process()
	if sends.Load() != 1 {
		t.Fatal("cooldown ignored")
	}
	if _, err := db.DB().Exec(`UPDATE error_alerts SET notified_at=NOW()-interval '31 minutes'`); err != nil {
		t.Fatal(err)
	}
	process()
	if sends.Load() != 2 {
		t.Fatal("new incident not sent")
	}
	if _, err := db.DB().Exec(`UPDATE error_alerts SET notified_at=NOW()-interval '31 minutes'`); err != nil {
		t.Fatal(err)
	}
	process()
	if sends.Load() != 2 {
		t.Fatal("already covered events counted again")
	}
}

func TestIntegrationErrorAlertsSkipIneligibleGroups(t *testing.T) {
	db := integrationDatabase(t)
	if err := db.Migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	var sends atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if !strings.Contains(string(body), "Origin: worker") {
			t.Errorf("unexpected notification %s", body)
		}
		sends.Add(1)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	policy := testErrorPolicy()
	reporter := NewErrorReporter(db.DB(), "build", policy, NewNtfyService(server.URL, "errors", "", 3, ""))
	for _, stage := range []string{"request", "response", "setup", "solve", "verify", "play", "read", "render", "import", "run"} {
		for _, cause := range []string{"network", "timeout", "unavailable", "invalid-response", "unexpected", "media-network", "media-decode", "media-source", "missing-file", "io"} {
			e := ErrorEvent{Operation: "captcha", Stage: stage, Cause: cause, Outcome: "blocked"}
			for range policy.BrowserCount {
				if err := reporter.Record(context.Background(), "browser", "one-source", e); err != nil {
					t.Fatal(err)
				}
			}
		}
	}
	worker := ErrorEvent{Operation: "waveform", Stage: "run", Cause: "unavailable", Outcome: "blocked"}
	if err := reporter.Record(context.Background(), "worker", "", worker); err != nil {
		t.Fatal(err)
	}
	for range 3 {
		if err := reporter.Process(); err != nil {
			t.Fatal(err)
		}
		if got := sends.Load(); got != 1 {
			t.Fatalf("got %d alerts, want one worker alert despite 100 ineligible browser groups", got)
		}
	}
}

func TestIntegrationErrorAlertRetrySurvivesWindowAndRestart(t *testing.T) {
	db := integrationDatabase(t)
	if err := db.Migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	var attempts atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if attempts.Add(1) == 1 {
			w.WriteHeader(503)
		} else {
			w.WriteHeader(200)
		}
	}))
	defer server.Close()
	newReporter := func() *ErrorReporter {
		return NewErrorReporter(db.DB(), "build", testErrorPolicy(), NewNtfyService(server.URL, "errors", "", 3, ""))
	}
	reporter := newReporter()
	reporter.Report("worker", ErrorEvent{Operation: "waveform", Stage: "run", Cause: "partial-failure", Outcome: "degraded", FailedItems: 3, AttemptedItems: 10})
	if err := reporter.Process(); err != nil {
		t.Fatal(err)
	}
	if err := reporter.Process(); err != nil {
		t.Fatal(err)
	}
	if attempts.Load() != 1 {
		t.Fatal("backoff ignored")
	}
	if _, err := db.DB().Exec(`UPDATE error_reports SET created_at=NOW()-interval '8 days'; UPDATE error_alerts SET next_attempt=NOW()-interval '1 minute'`); err != nil {
		t.Fatal(err)
	}
	if err := newReporter().Process(); err != nil {
		t.Fatal(err)
	}
	if attempts.Load() != 2 {
		t.Fatal("pending alert lost after window expired")
	}
	var pending, remaining int
	db.DB().QueryRow(`SELECT COUNT(*) FROM error_alerts WHERE pending_body IS NOT NULL`).Scan(&pending)
	db.DB().QueryRow(`SELECT COUNT(*) FROM error_reports`).Scan(&remaining)
	if pending != 0 || remaining != 0 {
		t.Fatalf("pending %d, expired reports %d", pending, remaining)
	}
}
