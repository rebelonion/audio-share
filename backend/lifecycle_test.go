package main

import (
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/onion/audio-share-backend/config"
)

func TestRetirementAndShutdownPreserveLiveResponse(t *testing.T) {
	l := newLifecycle(func(context.Context) error { return nil })
	public, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	admin, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	release := make(chan struct{})
	var once sync.Once
	finish := func() { once.Do(func() { close(release) }) }
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(func() { finish(); cancel() })
	payload := strings.Repeat("audio-bytes", 5000)
	handler := l.public(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/stream" {
			w.Write([]byte("new request"))
			return
		}
		done := l.startMedia()
		defer done()
		w.Write([]byte(payload[:100]))
		w.(http.Flusher).Flush()
		<-release
		w.Write([]byte(payload[100:]))
	}))
	stopped := make(chan error, 1)
	go func() { stopped <- serveUntilStopped(ctx, public, handler, admin, l, nil) }()
	transport := &http.Transport{DisableKeepAlives: true}
	t.Cleanup(transport.CloseIdleConnections)
	client := &http.Client{Transport: transport, Timeout: 5 * time.Second}
	base := "http://" + public.Addr().String()
	management := "http://" + admin.Addr().String()
	response, err := client.Get(base + "/stream")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	request := func(method, url string, want int) {
		t.Helper()
		r, err := http.NewRequest(method, url, nil)
		if err != nil {
			t.Fatal(err)
		}
		res, err := client.Do(r)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		if res.StatusCode != want {
			t.Fatalf("%s: got %d, want %d", url, res.StatusCode, want)
		}
	}
	request("GET", base+"/health", 200)
	request("POST", management+"/retire", 202)
	request("GET", base+"/ready", 503)
	request("GET", base+"/next", 200)
	res, err := client.Get(management + "/status")
	if err != nil {
		t.Fatal(err)
	}
	var status struct {
		ActiveRequests, ActiveMediaResponses int
		State                                string
	}
	if err := json.NewDecoder(res.Body).Decode(&status); err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if status.ActiveRequests != 1 || status.ActiveMediaResponses != 1 || status.State != "retiring" {
		t.Fatalf("status: %+v", status)
	}
	request("POST", management+"/resume", 202)
	request("GET", base+"/ready", 200)
	request("POST", management+"/shutdown", 202)
	select {
	case err := <-stopped:
		t.Fatalf("stopped before stream completed: %v", err)
	default:
	}
	request("GET", management+"/status", 200)
	request("POST", management+"/resume", 409)
	finish()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	if string(body) != payload {
		t.Fatalf("stream truncated: %d of %d bytes", len(body), len(payload))
	}
	select {
	case err := <-stopped:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("server did not finish shutdown")
	}
}

func TestReadinessFailureAndWorkerRetirement(t *testing.T) {
	l := newLifecycle(func(ctx context.Context) error { return context.DeadlineExceeded })
	w := httptest.NewRecorder()
	l.public(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Fatal("probe entered app middleware") })).ServeHTTP(w, httptest.NewRequest("GET", "/ready", nil))
	if w.Code != 503 {
		t.Fatal(w.Code)
	}
	runs := 0
	job := l.job(func() { runs++ })
	job()
	l.management().ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("POST", "/retire", nil))
	job()
	if runs != 1 {
		t.Fatalf("retired worker admitted a job: %d", runs)
	}
}

func TestStartupRejectsMissingFrontendEntryAsset(t *testing.T) {
	dir := t.TempDir()
	if err := os.Mkdir(filepath.Join(dir, "assets"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte(`<html><script src="/assets/current.js"></script></html>`), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "assets", "old.js"), []byte("old"), 0644); err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{StaticDir: dir}
	if err := validateWebFiles(cfg); err == nil {
		t.Fatal("accepted missing entry script")
	}
	if err := os.WriteFile(filepath.Join(dir, "assets", "current.js"), []byte("current"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := validateWebFiles(cfg); err != nil {
		t.Fatal(err)
	}
}
