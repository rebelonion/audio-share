package handlers

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/onion/audio-share-backend/services"
)

func recoveryDatabase(t *testing.T) *services.Database {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL for PostgreSQL integration tests")
	}
	admin, err := services.OpenDatabase(context.Background(), dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { admin.Close() })
	schema := fmt.Sprintf("audio_recovery_test_%d", time.Now().UnixNano())
	quoted := pgx.Identifier{schema}.Sanitize()
	if _, err := admin.DB().Exec("CREATE SCHEMA " + quoted); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := admin.DB().Exec("DROP SCHEMA " + quoted + " CASCADE"); err != nil {
			t.Error(err)
		}
	})
	config, err := pgx.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	config.RuntimeParams["search_path"] = schema + ",public"
	registered := stdlib.RegisterConnConfig(config)
	t.Cleanup(func() { stdlib.UnregisterConnConfig(registered) })
	db, err := services.OpenDatabase(context.Background(), registered)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if err := db.Migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	return db
}

func TestIntegrationAudioRecoveryServesOriginalShareKey(t *testing.T) {
	for _, mode := range []string{"stream", "download", "deleted-access", "ambiguous", "restricted"} {
		t.Run(mode, func(t *testing.T) {
			db := recoveryDatabase(t)
			dir := t.TempDir()
			fs := services.NewFileSystemService(dir + ":Audio")
			const oldName = "old [id].m4a"
			for _, name := range []string{"old [id]", "new [id]", "another [id]"} {
				if err := os.WriteFile(filepath.Join(dir, name+".info.json"), []byte(`{}`), 0600); err != nil {
					t.Fatal(err)
				}
			}
			if err := os.WriteFile(filepath.Join(dir, oldName), []byte("old audio"), 0600); err != nil {
				t.Fatal(err)
			}
			if err := services.NewSearchService(db, fs, nil).RebuildIndex(); err != nil {
				t.Fatal(err)
			}
			var key string
			if err := db.DB().QueryRow(`SELECT share_key FROM audio_files`).Scan(&key); err != nil {
				t.Fatal(err)
			}
			if err := os.Remove(filepath.Join(dir, oldName)); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(dir, "new [id].opus"), []byte("replacement audio"), 0600); err != nil {
				t.Fatal(err)
			}
			if mode == "ambiguous" {
				if err := os.WriteFile(filepath.Join(dir, "another [id].opus"), []byte("other"), 0600); err != nil {
					t.Fatal(err)
				}
			}
			if mode == "restricted" {
				if _, err := db.DB().Exec(`UPDATE audio_files SET removal_requested_at=NOW()`); err != nil {
					t.Fatal(err)
				}
			}
			if mode == "deleted-access" {
				if _, err := db.DB().Exec(`UPDATE audio_files SET deleted=1`); err != nil {
					t.Fatal(err)
				}
			}
			manager := newTestHandlerAccessKeyManager(t, "10/1m")
			handler := NewAudioHandler(fs, db.DB(), AudioHandlerOptions{SessionSecret: "test-secret", AccessKeys: manager})
			if mode == "deleted-access" {
				req := signedAudioRequest(http.MethodPost, "https://example.test/api/audio/key/"+key+"/access", `{"purpose":"stream"}`, "test-secret", "session-one")
				rec := httptest.NewRecorder()
				handler.ServeHTTP(rec, req)
				if rec.Code != http.StatusNotFound {
					t.Fatalf("access status=%d body=%s", rec.Code, rec.Body.String())
				}
			}
			purpose := services.MediaPurposeStream
			action := ""
			if mode == "download" {
				purpose = services.MediaPurposeDownload
				action = "/download"
			}
			grant, err := manager.IssueCaptchaCleared("session-one", "192.0.2.1", key, purpose)
			if err != nil {
				t.Fatal(err)
			}
			req := signedAudioRequest(http.MethodGet, "https://example.test/api/audio/key/"+key+action+"?access_key="+grant.AccessKey, "", "test-secret", "session-one")
			req.Header.Set("User-Agent", "Mozilla/5.0")
			req.Header.Set("Range", "bytes=0-10")
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)
			if mode == "deleted-access" {
				if rec.Code != http.StatusGone {
					t.Fatalf("deleted stream status=%d", rec.Code)
				}
				var attempts int
				if err := db.DB().QueryRow(`SELECT count(*) FROM media_recovery_attempts`).Scan(&attempts); err != nil {
					t.Fatal(err)
				}
				if attempts != 0 {
					t.Fatal("deleted playback triggered recovery")
				}
				return
			}
			if mode == "ambiguous" {
				if rec.Code != 503 {
					t.Fatalf("ambiguous status=%d body=%s", rec.Code, rec.Body.String())
				}
				return
			}
			if mode == "restricted" {
				if rec.Code != 410 {
					t.Fatalf("restricted status=%d body=%s", rec.Code, rec.Body.String())
				}
				return
			}
			if rec.Code != http.StatusPartialContent || rec.Body.String() != "replacement" {
				t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
			}
			if rec.Header().Get("Content-Type") != "audio/opus" {
				t.Fatalf("content type=%s", rec.Header().Get("Content-Type"))
			}
		})
	}
}

func TestIntegrationAudioKnownIdentityMismatchBlocksExistingGrants(t *testing.T) {
	for _, mode := range []string{"replacement", "deleted-filename-reuse", "deferred-conflict", "unrelated-sidecar-failure"} {
		t.Run(mode, func(t *testing.T) {
			db := recoveryDatabase(t)
			dir := t.TempDir()
			fs := services.NewFileSystemService(dir + ":Audio")
			write := func(name, id, body string) {
				t.Helper()
				if err := os.WriteFile(filepath.Join(dir, name+".m4a"), []byte(body), 0600); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(filepath.Join(dir, name+".info.json"), []byte(fmt.Sprintf(`{"id":%q}`, id)), 0600); err != nil {
					t.Fatal(err)
				}
			}
			index := func() {
				t.Helper()
				if err := services.NewSearchService(db, fs, nil).RebuildIndex(); err != nil {
					t.Fatal(err)
				}
			}
			write("track", "A", "original audio")
			if mode == "deferred-conflict" {
				write("other", "B", "other audio")
			}
			index()
			var id int64
			var key string
			if err := db.DB().QueryRow(`SELECT id,share_key FROM audio_files WHERE media_id='A'`).Scan(&id, &key); err != nil {
				t.Fatal(err)
			}
			if _, err := db.DB().Exec(`INSERT INTO waveform_cache(audio_file_id,peaks,duration_seconds) VALUES($1,'old-waveform',10)`, id); err != nil {
				t.Fatal(err)
			}
			manager := newTestHandlerAccessKeyManager(t, "10/1m")
			handler := NewAudioHandler(fs, db.DB(), AudioHandlerOptions{SessionSecret: "test-secret", AccessKeys: manager})
			stream, err := manager.IssueCaptchaCleared("session-one", "192.0.2.1", key, services.MediaPurposeStream)
			if err != nil {
				t.Fatal(err)
			}
			download, err := manager.IssueCaptchaCleared("session-one", "192.0.2.1", key, services.MediaPurposeDownload)
			if err != nil {
				t.Fatal(err)
			}
			if mode == "deleted-filename-reuse" {
				if err := os.Remove(filepath.Join(dir, "track.m4a")); err != nil {
					t.Fatal(err)
				}
				if _, err := db.DB().Exec(`UPDATE audio_files SET indexed_at=NOW()-INTERVAL '1 day'`); err != nil {
					t.Fatal(err)
				}
				index()
			}
			write("track", "B", "wrong replacement audio")
			if mode == "unrelated-sidecar-failure" {
				write("broken", "broken", "neighbor audio")
				if err := os.Remove(filepath.Join(dir, "broken.info.json")); err != nil {
					t.Fatal(err)
				}
			}
			index()
			for suffix, grant := range map[string]string{"": stream.AccessKey, "/download": download.AccessKey} {
				for _, method := range []string{http.MethodGet, http.MethodHead} {
					req := signedAudioRequest(method, "https://example.test/api/audio/key/"+key+suffix+"?access_key="+grant, "", "test-secret", "session-one")
					req.Header.Set("User-Agent", "Mozilla/5.0")
					rec := httptest.NewRecorder()
					handler.ServeHTTP(rec, req)
					if rec.Code != http.StatusGone {
						t.Fatalf("%s %s: status=%d body=%s", method, suffix, rec.Code, rec.Body.String())
					}
				}
			}
			req := signedAudioRequest(http.MethodGet, "https://example.test/api/audio/key/"+key+"/waveform", "", "test-secret", "session-one")
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)
			if rec.Code != http.StatusNotFound {
				t.Fatalf("retired waveform status=%d body=%s", rec.Code, rec.Body.String())
			}
			req = signedAudioRequest(http.MethodPost, "https://example.test/api/audio/key/"+key+"/access", `{"purpose":"stream"}`, "test-secret", "session-one")
			rec = httptest.NewRecorder()
			handler.ServeHTTP(rec, req)
			if rec.Code != http.StatusNotFound {
				t.Fatalf("retired access status=%d body=%s", rec.Code, rec.Body.String())
			}
			var events, attempts int
			if err := db.DB().QueryRow(`SELECT (SELECT count(*) FROM download_events WHERE audio_file_id=$1), (SELECT count(*) FROM media_recovery_attempts)`, id).Scan(&events, &attempts); err != nil {
				t.Fatal(err)
			}
			if events != 0 || attempts != 0 {
				t.Fatalf("blocked requests wrote events=%d or triggered recovery=%d", events, attempts)
			}
			write("restored", "A", "restored original audio")
			if mode == "unrelated-sidecar-failure" {
				write("broken", "broken", "neighbor audio")
			}
			index()
			req = signedAudioRequest(http.MethodGet, "https://example.test/api/audio/key/"+key+"?access_key="+stream.AccessKey, "", "test-secret", "session-one")
			req.Header.Set("User-Agent", "Mozilla/5.0")
			rec = httptest.NewRecorder()
			handler.ServeHTTP(rec, req)
			if rec.Code != http.StatusOK || rec.Body.String() != "restored original audio" {
				t.Fatalf("restored stream status=%d body=%s", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestIntegrationPlaybackPreparationErrorTimings(t *testing.T) {
	for _, step := range []string{"database-lookup", "file-stat", "recovery", "file-open"} {
		t.Run(step, func(t *testing.T) {
			db := recoveryDatabase(t)
			dir := t.TempDir()
			path := filepath.Join(dir, "track.m4a")
			if err := os.WriteFile(path, []byte("audio"), 0600); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(dir, "track.info.json"), []byte(`{"id":"track"}`), 0600); err != nil {
				t.Fatal(err)
			}
			fs := services.NewFileSystemService(dir + ":Audio")
			if err := services.NewSearchService(db, fs, nil).RebuildIndex(); err != nil {
				t.Fatal(err)
			}
			var key string
			if err := db.DB().QueryRow(`SELECT share_key FROM audio_files`).Scan(&key); err != nil {
				t.Fatal(err)
			}
			manager := newTestHandlerAccessKeyManager(t, "10/1m")
			handler := NewAudioHandler(fs, db.DB(), AudioHandlerOptions{SessionSecret: "test-secret", AccessKeys: manager})
			grant, err := manager.IssueCaptchaCleared("session-one", "192.0.2.1", key, services.MediaPurposeStream)
			if err != nil {
				t.Fatal(err)
			}
			req := signedAudioRequest(http.MethodGet, "https://example.test/api/audio/key/"+key+"?access_key="+grant.AccessKey, "", "test-secret", "session-one")
			event := services.ErrorEvent{}
			ctx := services.WithRequestError(req.Context(), &event)
			if step == "database-lookup" {
				db.DB().SetMaxOpenConns(1)
				conn, err := db.DB().Conn(context.Background())
				if err != nil {
					t.Fatal(err)
				}
				defer conn.Close()
				var cancel context.CancelFunc
				ctx, cancel = context.WithTimeout(ctx, 150*time.Millisecond)
				defer cancel()
			} else {
				if err := os.Remove(path); err != nil {
					t.Fatal(err)
				}
				switch step {
				case "recovery":
					if err := os.WriteFile(filepath.Join(dir, "replacement.m4a"), []byte("audio"), 0600); err != nil {
						t.Fatal(err)
					}
					if err := os.WriteFile(filepath.Join(dir, "replacement.info.json"), []byte(`{"id":`), 0600); err != nil {
						t.Fatal(err)
					}
				case "file-stat":
					if err := os.Symlink(path, path); err != nil {
						t.Fatal(err)
					}
				case "file-open":
					if err := os.Mkdir(path, 0700); err != nil {
						t.Fatal(err)
					}
				}
			}
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req.WithContext(ctx))
			wantStatus := http.StatusServiceUnavailable
			if step == "database-lookup" {
				wantStatus = http.StatusInternalServerError
			}
			if rec.Code != wantStatus || event.Context.Step != step {
				t.Fatalf("status=%d step=%q context=%+v", rec.Code, event.Context.Step, event.Context)
			}
			want := []string{"database-lookup"}
			if step != "database-lookup" {
				want = append(want, "file-stat")
				if step != "file-stat" {
					want = append(want, step)
				}
			}
			if len(event.Context.TimingsMS) != len(want) {
				t.Fatalf("unexpected timings: %v", event.Context.TimingsMS)
			}
			for _, name := range want {
				if duration, ok := event.Context.TimingsMS[name]; !ok || duration < 0 {
					t.Fatalf("missing timing for %s: %v", name, event.Context.TimingsMS)
				}
			}
			if step == "database-lookup" && event.Context.TimingsMS[step] < 100 {
				t.Fatalf("connection-pool wait not measured: %v", event.Context.TimingsMS)
			}
		})
	}
}
