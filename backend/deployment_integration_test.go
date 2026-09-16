package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/onion/audio-share-backend/config"
	"github.com/onion/audio-share-backend/services"
)

func TestIntegrationAudioSurvivesShutdownAndGrantWorksOnNextInstance(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL")
	}
	admin, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	schema := fmt.Sprintf("audio_share_http_test_%d", time.Now().UnixNano())
	quoted := pgx.Identifier{schema}.Sanitize()
	if _, err := admin.Exec("CREATE SCHEMA " + quoted); err != nil {
		t.Fatal(err)
	}
	defer func() {
		if _, err := admin.Exec("DROP SCHEMA " + quoted + " CASCADE"); err != nil {
			t.Error(err)
		}
	}()
	pgConfig, err := pgx.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	// pgx's DSN serialization retains runtime parameters, including search_path.
	parsed, err := url.Parse(pgConfig.ConnString())
	if err != nil || (parsed.Scheme != "postgres" && parsed.Scheme != "postgresql") {
		t.Fatal("integration test requires a PostgreSQL URL")
	}
	query := parsed.Query()
	query.Set("search_path", schema+",public")
	parsed.RawQuery = query.Encode()
	db, err := services.OpenDatabase(context.Background(), parsed.String())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := db.Migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	audioDir := t.TempDir()
	payload := bytes.Repeat([]byte("test-audio-payload"), 4096)
	if err := os.WriteFile(filepath.Join(audioDir, "track.mp3"), payload, 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := db.DB().Exec(`INSERT INTO audio_files(path,filename,size,share_key) VALUES('audio/track.mp3','track.mp3',$1,'deployment-track')`, len(payload)); err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{
		SessionSecret: "deployment-test-secret", AudioDir: audioDir + ":Audio",
		StaticDir: t.TempDir(), ContentDir: t.TempDir(),
		StreamKeyTTL: "1h", DownloadKeyTTL: "1h", DownloadSessionMinAge: "0s",
		StreamKeyLimits: "100/1m", DownloadKeyLimits: "100/1m",
		CapEnforcement: "off", DownloadCaptchaMode: "off", CapVerifyTimeout: "3s", StreamCaptchaClearanceTTL: "15m",
		SourceNormalizerTimeout: "15s", RateLimitWindow: 60000, MaxRequestsPerWindow: 1000,
		StreamBytesPerSecond: 32768, StreamBurstBytes: 4096, DownloadBytesPerSecond: 32768, DownloadBurstBytes: 4096,
	}
	fs := services.NewFileSystemService(cfg.AudioDir)
	start := func() (string, *lifecycle, <-chan error) {
		t.Helper()
		l := newLifecycle(db.CheckSchema)
		handler, err := appHandler(cfg, db, fs, l)
		if err != nil {
			t.Fatal(err)
		}
		public, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			t.Fatal(err)
		}
		management, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			t.Fatal(err)
		}
		ctx, cancel := context.WithCancel(context.Background())
		t.Cleanup(cancel)
		done := make(chan error, 1)
		go func() {
			done <- serveUntilStopped(ctx, public, l.public(handler), management, l, nil)
		}()
		return "http://" + public.Addr().String(), l, done
	}
	oldURL, old, oldDone := start()
	newURL, next, nextDone := start()
	jar, _ := cookiejar.New(nil)
	client := &http.Client{Jar: jar, Timeout: 10 * time.Second}
	post := func(endpoint, body string) *http.Response {
		t.Helper()
		res, err := client.Post(endpoint, "application/json", strings.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		if res.StatusCode != 200 && res.StatusCode != 204 {
			data, _ := io.ReadAll(res.Body)
			res.Body.Close()
			t.Fatalf("POST status %d: %s", res.StatusCode, data)
		}
		return res
	}
	res := post(oldURL+"/api/session", "")
	res.Body.Close()
	var transfers []*http.Response
	for _, purpose := range []string{"stream", "download"} {
		res := post(oldURL+"/api/audio/key/deployment-track/access", `{"purpose":"`+purpose+`"}`)
		var grant struct {
			AccessKey string `json:"accessKey"`
		}
		if err := json.NewDecoder(res.Body).Decode(&grant); err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		path := "/api/audio/key/deployment-track"
		if purpose == "download" {
			path += "/download"
		}
		path += "?access_key=" + url.QueryEscape(grant.AccessKey)
		request, _ := http.NewRequest("GET", oldURL+path, nil)
		request.Header.Set("User-Agent", "Mozilla/5.0")
		transfer, err := client.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		defer transfer.Body.Close()
		if transfer.StatusCode != 200 {
			t.Fatalf("%s status %d", purpose, transfer.StatusCode)
		}
		transfers = append(transfers, transfer)
		// An independent access-key manager accepts the previous instance's grant.
		seek, _ := http.NewRequest("GET", newURL+path, nil)
		seek.Header.Set("Range", "bytes=100-199")
		seek.Header.Set("User-Agent", "Mozilla/5.0")
		ranged, err := client.Do(seek)
		if err != nil {
			t.Fatal(err)
		}
		data, err := io.ReadAll(ranged.Body)
		ranged.Body.Close()
		if err != nil || ranged.StatusCode != 206 || !bytes.Equal(data, payload[100:200]) {
			t.Fatalf("range on new instance: status=%d err=%v", ranged.StatusCode, err)
		}
	}
	old.mu.Lock()
	active := old.media
	old.mu.Unlock()
	if active != 2 {
		t.Fatalf("expected two active media responses, got %d", active)
	}
	old.once.Do(func() { close(old.stop) })
	for _, transfer := range transfers {
		data, err := io.ReadAll(transfer.Body)
		if err != nil || !bytes.Equal(data, payload) {
			t.Fatalf("truncated media during shutdown: bytes=%d err=%v", len(data), err)
		}
	}
	select {
	case err := <-oldDone:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("old instance did not exit")
	}
	next.once.Do(func() { close(next.stop) })
	select {
	case err := <-nextDone:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("new instance did not exit")
	}
}
