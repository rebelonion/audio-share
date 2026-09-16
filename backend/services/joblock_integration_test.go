package services

import (
	"context"
	"database/sql"
	"fmt"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

func TestIntegrationJobLockConnectionLossPreventsWrites(t *testing.T) {
	db := integrationDatabase(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if _, err := db.db.ExecContext(ctx, "CREATE TABLE job_writes (writer text)"); err != nil {
		t.Fatal(err)
	}
	err := withJobLock(db.db, "connection-loss", func(original *sql.Conn) error {
		var pid int
		if err := original.QueryRowContext(ctx, "SELECT pg_backend_pid()").Scan(&pid); err != nil {
			return err
		}
		var terminated bool
		if err := db.db.QueryRowContext(ctx, "SELECT pg_terminate_backend($1)", pid).Scan(&terminated); err != nil {
			return err
		}
		if !terminated {
			return fmt.Errorf("lock connection was not terminated")
		}
		ran := false
		if err := withJobLock(db.db, "connection-loss", func(replacement *sql.Conn) error {
			ran = true
			// Even retries must not obtain a pooled connection after losing the lock.
			for range 2 {
				if _, err := original.ExecContext(ctx, "INSERT INTO job_writes VALUES ('original')"); err == nil {
					t.Error("original job wrote while replacement owned the lock")
				}
			}
			if tx, err := original.BeginTx(ctx, nil); err == nil {
				tx.Rollback()
				t.Error("original job began a transaction after losing its lock")
			}
			_, err := replacement.ExecContext(ctx, "INSERT INTO job_writes VALUES ('replacement')")
			return err
		}); err != nil {
			t.Error(err)
		}
		if !ran {
			t.Error("replacement could not acquire the released lock")
		}
		// The helper must report connection loss even if the job ignores its errors.
		return nil
	})
	if err == nil {
		t.Fatal("job succeeded despite losing its lock connection")
	}
	var count int
	if err := db.db.QueryRowContext(ctx, "SELECT count(*) FROM job_writes WHERE writer = 'replacement'").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("replacement writes = %d, want 1", count)
	}
}

func TestIntegrationJobsWriteThroughLockConnection(t *testing.T) {
	db := integrationDatabase(t)
	ctx := context.Background()
	if err := db.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := db.db.Exec(`
		INSERT INTO playback_access_keys(access_key_nonce, expires_at) VALUES ('expired', NOW() - INTERVAL '1 day');
		INSERT INTO playback_access_keys(access_key_nonce) VALUES ('legacy');
		CREATE FUNCTION require_job_lock() RETURNS trigger LANGUAGE plpgsql AS $$
		BEGIN
			IF NOT EXISTS (SELECT 1 FROM pg_locks WHERE pid = pg_backend_pid() AND locktype = 'advisory' AND granted) THEN
				RAISE EXCEPTION 'job wrote without holding its lock on this connection';
			END IF;
			RETURN NULL;
		END $$;
	`); err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{"folders", "audio_files", "waveform_cache", "playback_access_keys"} {
		if _, err := db.db.Exec("CREATE TRIGGER check_job_lock AFTER INSERT OR UPDATE OR DELETE ON " + table + " FOR EACH STATEMENT EXECUTE FUNCTION require_job_lock()"); err != nil {
			t.Fatal(err)
		}
	}
	directory := t.TempDir()
	fs := NewFileSystemService(directory + ":Audio")
	t.Run("index", func(t *testing.T) {
		if err := NewSearchService(db, fs, nil).RebuildIndex(); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("playback cleanup", func(t *testing.T) {
		if err := NewPlaybackService(db, 30*time.Minute).CleanupAccessKeyClaims(); err != nil {
			t.Fatal(err)
		}
		var count int
		if err := db.db.QueryRow("SELECT count(*) FROM playback_access_keys WHERE expires_at IS NOT NULL").Scan(&count); err != nil || count != 1 {
			t.Fatalf("cleanup count = %d, err = %v", count, err)
		}
	})
	t.Run("waveform", func(t *testing.T) {
		for _, name := range []string{"ffmpeg", "ffprobe"} {
			if _, err := exec.LookPath(name); err != nil {
				t.Skip(name + " required for waveform integration")
			}
		}
		cmd := exec.Command("ffmpeg", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", filepath.Join(directory, "track.wav"))
		if output, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("generate audio: %v: %s", err, output)
		}
		if err := NewSearchService(db, fs, nil).RebuildIndex(); err != nil {
			t.Fatal(err)
		}
		if err := NewWaveformService(db.db, fs, 2).RunJob(time.Minute); err != nil {
			t.Fatal(err)
		}
		var count int
		if err := db.db.QueryRow("SELECT count(*) FROM waveform_cache").Scan(&count); err != nil || count != 1 {
			t.Fatalf("waveform count = %d, err = %v", count, err)
		}
	})
}
