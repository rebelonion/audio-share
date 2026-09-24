package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"
)

type mediaFixture struct {
	db  *Database
	fs  *FileSystemService
	dir string
}

func newMediaFixture(t *testing.T) mediaFixture {
	t.Helper()
	db := integrationDatabase(t)
	if err := db.Migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	return mediaFixture{db, NewFileSystemService(dir + ":Audio"), dir}
}
func (f mediaFixture) write(t *testing.T, name, id, body string) {
	t.Helper()
	full := filepath.Join(f.dir, name)
	if err := os.MkdirAll(filepath.Dir(full), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(full, []byte(body), 0600); err != nil {
		t.Fatal(err)
	}
	sidecar := full[:len(full)-len(filepath.Ext(full))] + ".info.json"
	if _, err := os.Stat(sidecar); os.IsNotExist(err) {
		if err := os.WriteFile(sidecar, []byte(`{}`), 0600); err != nil {
			t.Fatal(err)
		}
	}
	if id != "" {
		data, _ := json.Marshal(map[string]any{"id": id, "title": name, "epoch": 1700000000})
		if err := os.WriteFile(full[:len(full)-len(filepath.Ext(full))]+".info.json", data, 0600); err != nil {
			t.Fatal(err)
		}
	}
}
func (f mediaFixture) index(t *testing.T) {
	t.Helper()
	if err := NewSearchService(f.db, f.fs, nil).RebuildIndex(); err != nil {
		t.Fatal(err)
	}
}
func (f mediaFixture) record(t *testing.T, name string) (int64, string) {
	t.Helper()
	var id int64
	var key string
	if err := f.db.db.QueryRow(`SELECT id,share_key FROM audio_files WHERE path=$1 ORDER BY deleted, id DESC LIMIT 1`, "audio/"+name).Scan(&id, &key); err != nil {
		t.Fatal(err)
	}
	return id, key
}
func (f mediaFixture) remove(t *testing.T, name string) {
	t.Helper()
	if err := os.Remove(filepath.Join(f.dir, name)); err != nil {
		t.Fatal(err)
	}
}
func (f mediaFixture) seedFavoriteAndWaveform(t *testing.T, id int64) {
	t.Helper()
	if _, err := f.db.db.Exec(`INSERT INTO anonymous_profiles(session_id) VALUES('test-profile')`); err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{`INSERT INTO likes(profile_id,audio_file_id) VALUES('test-profile',$1)`, `INSERT INTO waveform_cache(audio_file_id,peaks,duration_seconds) VALUES($1,'old-waveform',100)`} {
		if _, err := f.db.db.Exec(q, id); err != nil {
			t.Fatal(err)
		}
	}
}

func TestIntegrationMediaReplacementPreservesIdentity(t *testing.T) {
	for _, mode := range []string{"index", "playback", "concurrent", "legacy-filename"} {
		t.Run(mode, func(t *testing.T) {
			f := newMediaFixture(t)
			oldName, newName := "old [fallback].m4a", "new [fallback].opus"
			f.write(t, oldName, "stable", "original audio")
			f.index(t)
			id, key := f.record(t, oldName)
			f.seedFavoriteAndWaveform(t, id)
			if mode == "legacy-filename" {
				if _, err := f.db.db.Exec(`UPDATE audio_files SET media_id=NULL WHERE id=$1`, id); err != nil {
					t.Fatal(err)
				}
			}
			f.remove(t, oldName)
			newID := "stable"
			if mode == "legacy-filename" {
				newID = ""
			}
			f.write(t, newName, newID, "shorter")

			switch mode {
			case "playback":
				if err := RecoverMissingAudio(context.Background(), f.db.db, f.fs, id); err != nil {
					t.Fatal(err)
				}
			case "concurrent":
				var wg sync.WaitGroup
				for i := 0; i < 6; i++ {
					wg.Add(1)
					go func(i int) {
						defer wg.Done()
						var err error
						if i%2 == 0 {
							err = NewSearchService(f.db, f.fs, nil).RebuildIndex()
						} else {
							err = RecoverMissingAudio(context.Background(), f.db.db, f.fs, id)
						}
						if err != nil {
							t.Error(err)
						}
					}(i)
				}
				wg.Wait()
			default:
				f.index(t)
			}
			gotID, gotKey := f.record(t, newName)
			if gotID != id || gotKey != key {
				t.Fatalf("identity changed: %d/%s -> %d/%s", id, key, gotID, gotKey)
			}
			var likes, cache, records, deleted int
			if err := f.db.db.QueryRow(`SELECT (SELECT count(*) FROM likes WHERE audio_file_id=$1),(SELECT count(*) FROM waveform_cache WHERE audio_file_id=$1),(SELECT count(*) FROM audio_files),deleted FROM audio_files WHERE id=$1`, id).Scan(&likes, &cache, &records, &deleted); err != nil {
				t.Fatal(err)
			}
			if likes != 1 || cache != 0 || records != 1 || deleted != 0 {
				t.Fatalf("likes=%d cache=%d records=%d deleted=%d", likes, cache, records, deleted)
			}
		})
	}
}

func TestIntegrationMediaDuplicateIDsStaySeparate(t *testing.T) {
	for _, mode := range []string{"two-replacements", "two-old-records", "original-still-present", "different-folder", "metadata-conflict", "no-id"} {
		t.Run(mode, func(t *testing.T) {
			f := newMediaFixture(t)
			idValue := "stable"
			if mode == "no-id" {
				idValue = ""
			}
			f.write(t, "old.m4a", idValue, "old audio")
			if mode == "two-old-records" {
				f.write(t, "other.m4a", idValue, "other audio")
			}
			f.index(t)
			oldID, oldKey := f.record(t, "old.m4a")
			if mode != "original-still-present" {
				f.remove(t, "old.m4a")
			}
			if mode == "two-old-records" {
				f.remove(t, "other.m4a")
			}
			newName := "new.m4a"
			if mode == "different-folder" {
				newName = "elsewhere/new.m4a"
			}
			if mode == "metadata-conflict" {
				idValue = "different"
			}
			f.write(t, newName, idValue, "replacement")
			if mode == "two-replacements" {
				f.write(t, "another.m4a", idValue, "another replacement")
			}
			if err := RecoverMissingAudio(context.Background(), f.db.db, f.fs, oldID); err != nil {
				t.Fatal(err)
			}
			_, stillKey := f.record(t, "old.m4a")
			if stillKey != oldKey {
				t.Fatal("recovery changed ambiguous record")
			}
			f.index(t)
			newID, newKey := f.record(t, newName)
			if oldID == newID || oldKey == newKey {
				t.Fatal("ambiguous or unrelated files merged")
			}
			_, stillKey = f.record(t, "old.m4a")
			if stillKey != oldKey {
				t.Fatal("old share key changed")
			}
		})
	}
}

func TestIntegrationMediaSamePathAndMetadataBackfill(t *testing.T) {
	f := newMediaFixture(t)
	f.write(t, "track.m4a", "", "original")
	f.index(t)
	id, key := f.record(t, "track.m4a")
	f.seedFavoriteAndWaveform(t, id)
	if err := os.WriteFile(filepath.Join(f.dir, "track.info.json"), []byte(`{"id":"backfilled"}`), 0600); err != nil {
		t.Fatal(err)
	}
	f.index(t)
	gotID, gotKey := f.record(t, "track.m4a")
	if gotID != id || gotKey != key {
		t.Fatal("backfill changed identity")
	}
	var mediaID string
	var cache int
	if err := f.db.db.QueryRow(`SELECT media_id,(SELECT count(*) FROM waveform_cache WHERE audio_file_id=$1) FROM audio_files WHERE id=$1`, id).Scan(&mediaID, &cache); err != nil {
		t.Fatal(err)
	}
	if mediaID != "backfilled" || cache != 1 {
		t.Fatalf("id=%s cache=%d", mediaID, cache)
	}
	f.write(t, "track.m4a", "", "changed!")
	future := time.Now().Add(time.Second)
	if err := os.Chtimes(filepath.Join(f.dir, "track.m4a"), future, future); err != nil {
		t.Fatal(err)
	}
	f.index(t)
	gotID, gotKey = f.record(t, "track.m4a")
	if gotID != id || gotKey != key {
		t.Fatal("same-path replacement changed identity")
	}
	if err := f.db.db.QueryRow(`SELECT count(*) FROM waveform_cache WHERE audio_file_id=$1`, id).Scan(&cache); err != nil {
		t.Fatal(err)
	}
	if cache != 0 {
		t.Fatal("stale waveform survived replacement")
	}
}

func TestIntegrationMediaRecoveryDoesNotImportOtherFiles(t *testing.T) {
	f := newMediaFixture(t)
	f.write(t, "old.m4a", "stable", "old")
	f.index(t)
	id, _ := f.record(t, "old.m4a")
	f.remove(t, "old.m4a")
	f.write(t, "new.m4a", "stable", "new")
	f.write(t, "unrelated.m4a", "another", "unrelated")
	if err := RecoverMissingAudio(context.Background(), f.db.db, f.fs, id); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := f.db.db.QueryRow(`SELECT count(*) FROM audio_files`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("records=%d", count)
	}
}

func TestIntegrationMediaStaleWaveformCannotPublishAfterReplacement(t *testing.T) {
	f := newMediaFixture(t)
	f.write(t, "track.m4a", "stable", "old audio")
	f.index(t)
	id, _ := f.record(t, "track.m4a")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	conn, err := f.db.db.Conn(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	var pid int
	var revision int64
	if err := conn.QueryRowContext(ctx, `SELECT pg_backend_pid(), media_revision FROM audio_files WHERE id=$1`, id).Scan(&pid, &revision); err != nil {
		t.Fatal(err)
	}
	tx, err := f.db.db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `UPDATE audio_files SET media_revision=media_revision+1 WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { _, err := storeWaveform(ctx, conn, id, revision, "stale", 123); done <- err }()
	// Ensure publication is waiting on the replacement's row lock before committing it.
	for {
		var waiting bool
		if err := f.db.db.QueryRowContext(ctx, `SELECT COALESCE(wait_event_type='Lock',false) FROM pg_stat_activity WHERE pid=$1`, pid).Scan(&waiting); err != nil {
			t.Fatal(err)
		}
		if waiting {
			break
		}
		select {
		case err := <-done:
			t.Fatalf("publication completed without waiting: %v", err)
		case <-ctx.Done():
			t.Fatal(ctx.Err())
		case <-time.After(10 * time.Millisecond):
		}
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	var count int
	if err := f.db.db.QueryRow(`SELECT count(*) FROM waveform_cache WHERE audio_file_id=$1`, id).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatal("stale waveform published after replacement")
	}
	result, err := storeWaveform(ctx, conn, id, revision+1, "fresh", 99)
	if err != nil {
		t.Fatal(err)
	}
	n, err := result.RowsAffected()
	if err != nil || n != 1 {
		t.Fatalf("fresh waveform rows=%d err=%v", n, err)
	}
}

func TestIntegrationMediaEmptyFolderRecovery(t *testing.T) {
	f := newMediaFixture(t)
	f.write(t, "track.m4a", "", "audio")
	f.index(t)
	id, _ := f.record(t, "track.m4a")
	f.remove(t, "track.m4a")
	if err := RecoverMissingAudio(context.Background(), f.db.db, f.fs, id); err != nil {
		t.Fatal(err)
	}
	f.record(t, "track.m4a")
}

func TestIntegrationMediaDeletedRecordsWaitForIndex(t *testing.T) {
	for _, name := range []string{"old.m4a", "new.m4a"} {
		t.Run(name, func(t *testing.T) {
			f := newMediaFixture(t)
			f.write(t, "old.m4a", "stable", "old")
			f.index(t)
			id, key := f.record(t, "old.m4a")
			f.remove(t, "old.m4a")
			if _, err := f.db.db.Exec(`UPDATE audio_files SET indexed_at=NOW()-INTERVAL '1 day' WHERE id=$1`, id); err != nil {
				t.Fatal(err)
			}
			f.index(t)
			f.write(t, name, "stable", "replacement")
			if err := RecoverMissingAudio(context.Background(), f.db.db, f.fs, id); err != nil {
				t.Fatal(err)
			}
			var deleted, attempts int
			if err := f.db.db.QueryRow(`SELECT deleted, (SELECT count(*) FROM media_recovery_attempts) FROM audio_files WHERE id=$1`, id).Scan(&deleted, &attempts); err != nil {
				t.Fatal(err)
			}
			if deleted != 1 || attempts != 0 {
				t.Fatalf("deleted=%d attempts=%d", deleted, attempts)
			}
			f.index(t)
			got, gotKey := f.record(t, name)
			if got != id || gotKey != key {
				t.Fatal("index did not preserve restored record")
			}
			if err := f.db.db.QueryRow(`SELECT deleted FROM audio_files WHERE id=$1`, id).Scan(&deleted); err != nil {
				t.Fatal(err)
			}
			if deleted != 0 {
				t.Fatal("index did not restore deleted record")
			}
		})
	}
}

func TestIntegrationMediaRecoveryCooldown(t *testing.T) {
	for _, failedScan := range []bool{false, true} {
		t.Run(fmt.Sprint("failed-scan-", failedScan), func(t *testing.T) {
			f := newMediaFixture(t)
			f.write(t, "old.m4a", "stable", "old")
			f.index(t)
			id, _ := f.record(t, "old.m4a")
			f.remove(t, "old.m4a")
			moved := f.dir + "-offline"
			if failedScan {
				if err := os.Rename(f.dir, moved); err != nil {
					t.Fatal(err)
				}
				t.Cleanup(func() { os.Rename(moved, f.dir) })
			}
			err := RecoverMissingAudio(context.Background(), f.db.db, f.fs, id)
			if (err != nil) != failedScan {
				t.Fatalf("first scan error=%v", err)
			}
			if failedScan {
				if err := os.Rename(moved, f.dir); err != nil {
					t.Fatal(err)
				}
			}
			var first time.Time
			if err := f.db.db.QueryRow(`SELECT attempted_at FROM media_recovery_attempts WHERE parent_path='audio'`).Scan(&first); err != nil {
				t.Fatal(err)
			}
			f.write(t, "new.m4a", "stable", "new")
			var wg sync.WaitGroup
			for range 50 {
				wg.Add(1)
				go func() {
					defer wg.Done()
					if err := RecoverMissingAudio(context.Background(), f.db.db, f.fs, id); err != nil {
						t.Error(err)
					}
				}()
			}
			wg.Wait()
			f.record(t, "old.m4a")
			var after time.Time
			if err := f.db.db.QueryRow(`SELECT attempted_at FROM media_recovery_attempts WHERE parent_path='audio'`).Scan(&after); err != nil {
				t.Fatal(err)
			}
			if !after.Equal(first) {
				t.Fatal("cooldown allowed repeated scans")
			}
			if _, err := f.db.db.Exec(`UPDATE media_recovery_attempts SET attempted_at=NOW()-INTERVAL '31 seconds'`); err != nil {
				t.Fatal(err)
			}
			if err := RecoverMissingAudio(context.Background(), f.db.db, f.fs, id); err != nil {
				t.Fatal(err)
			}
			got, _ := f.record(t, "new.m4a")
			if got != id {
				t.Fatal("recovery after cooldown changed identity")
			}
		})
	}
}

func TestIntegrationMediaRecoverySharesFolderResults(t *testing.T) {
	f := newMediaFixture(t)
	for _, id := range []string{"one", "two", "old"} {
		f.write(t, id+".m4a", id, "old")
	}
	f.index(t)
	one, _ := f.record(t, "one.m4a")
	two, _ := f.record(t, "two.m4a")
	old, _ := f.record(t, "old.m4a")
	if _, err := f.db.db.Exec(`UPDATE audio_files SET deleted=1 WHERE id=$1`, old); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"one", "two", "old"} {
		f.remove(t, id+".m4a")
		f.write(t, id+"-new.m4a", id, "new")
	}
	var wg sync.WaitGroup
	for i := range 50 {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			id := one
			if i%2 == 1 {
				id = two
			}
			if err := RecoverMissingAudio(context.Background(), f.db.db, f.fs, id); err != nil {
				t.Error(err)
			}
		}(i)
	}
	wg.Wait()
	for name, want := range map[string]int64{"one-new.m4a": one, "two-new.m4a": two, "old.m4a": old} {
		got, _ := f.record(t, name)
		if got != want {
			t.Fatalf("record %s changed identity", name)
		}
	}
	// An index restores deleted records despite the still-active folder cooldown.
	f.index(t)
	got, _ := f.record(t, "old-new.m4a")
	if got != old {
		t.Fatal("index did not restore old deletion")
	}
}

func TestIntegrationMediaSidecarErrorsDeferFolderWithoutSplittingIdentity(t *testing.T) {
	for _, mode := range []string{"partial-json", "unreadable", "conflicting-filename-id", "existing-file", "missing", "missing-with-filename-id"} {
		t.Run(mode, func(t *testing.T) {
			f := newMediaFixture(t)
			oldName := "affected/old.m4a"
			f.write(t, oldName, "stable", "original audio")
			f.write(t, "affected/deleted.m4a", "gone", "deleted audio")
			f.write(t, "healthy/removed.m4a", "removed", "removed audio")
			f.index(t)
			id, key := f.record(t, oldName)
			tombstone, _ := f.record(t, "affected/deleted.m4a")
			removed, _ := f.record(t, "healthy/removed.m4a")
			f.seedFavoriteAndWaveform(t, id)
			if _, err := f.db.db.Exec(`UPDATE audio_files SET deleted=1 WHERE id=$1`, tombstone); err != nil {
				t.Fatal(err)
			}
			if _, err := f.db.db.Exec(`UPDATE audio_files SET indexed_at=NOW()-INTERVAL '1 day'`); err != nil {
				t.Fatal(err)
			}
			f.remove(t, oldName)
			f.remove(t, "affected/deleted.m4a")
			f.remove(t, "healthy/removed.m4a")
			newName := "affected/new.m4a"
			if mode == "conflicting-filename-id" || mode == "missing-with-filename-id" {
				newName = "affected/new [wrong].m4a"
			}
			if mode == "existing-file" {
				newName = oldName
			}
			f.write(t, newName, "", "replacement")
			sidecar := filepath.Join(f.dir, strings.TrimSuffix(newName, filepath.Ext(newName))+".info.json")
			if err := os.Remove(sidecar); err != nil {
				t.Fatal(err)
			}
			if mode == "unreadable" {
				if err := os.Mkdir(sidecar, 0700); err != nil {
					t.Fatal(err)
				}
			} else if mode != "missing" && mode != "missing-with-filename-id" {
				if err := os.WriteFile(sidecar, []byte(`{"id":`), 0600); err != nil {
					t.Fatal(err)
				}
			}
			f.write(t, "affected/new-neighbor.m4a", "neighbor", "neighbor")
			f.write(t, "healthy/new.m4a", "healthy", "healthy")
			if err := RecoverMissingAudio(context.Background(), f.db.db, f.fs, id); mode != "existing-file" && !errors.Is(err, errIncompleteAudioDirectory) {
				t.Fatalf("recovery error=%v, want incomplete scan", err)
			}
			f.index(t)
			var count, deleted, cache, likes int
			var mediaID, title, gotKey string
			if err := f.db.db.QueryRow(`SELECT media_id,title,share_key,deleted,
    (SELECT count(*) FROM audio_files WHERE parent_path='audio/affected'),
    (SELECT count(*) FROM waveform_cache WHERE audio_file_id=$1),
    (SELECT count(*) FROM likes WHERE audio_file_id=$1)
    FROM audio_files WHERE id=$1`, id).Scan(&mediaID, &title, &gotKey, &deleted, &count, &cache, &likes); err != nil {
				t.Fatal(err)
			}
			if mediaID != "stable" || title != oldName || gotKey != key || deleted != 0 || count != 2 || cache != 1 || likes != 1 {
				t.Fatalf("deferred folder changed: id=%s title=%s key=%s deleted=%d records=%d cache=%d likes=%d", mediaID, title, gotKey, deleted, count, cache, likes)
			}
			for _, recordID := range []int64{tombstone, removed} {
				if err := f.db.db.QueryRow(`SELECT deleted FROM audio_files WHERE id=$1`, recordID).Scan(&deleted); err != nil {
					t.Fatal(err)
				}
				if deleted != 1 {
					t.Fatalf("record %d should remain/be marked deleted", recordID)
				}
			}
			f.record(t, "healthy/new.m4a")
			if mode == "unreadable" {
				if err := os.Remove(sidecar); err != nil {
					t.Fatal(err)
				}
			}
			f.write(t, newName, "stable", "replacement")
			f.index(t)
			gotID, gotKey := f.record(t, newName)
			if gotID != id || gotKey != key {
				t.Fatal("repaired sidecar split the original identity")
			}
			if err := f.db.db.QueryRow(`SELECT count(*) FROM audio_files WHERE parent_path='audio/affected' AND media_id='stable'`).Scan(&count); err != nil {
				t.Fatal(err)
			}
			if count != 1 {
				t.Fatalf("stable identity has %d records", count)
			}
			if err := f.db.db.QueryRow(`SELECT count(*) FROM likes WHERE audio_file_id=$1`, id).Scan(&likes); err != nil {
				t.Fatal(err)
			}
			if likes != 1 {
				t.Fatal("original favorite lost")
			}
			f.record(t, "affected/new-neighbor.m4a")
		})
	}
}

// Hold the existing row so the indexer finishes reading the directory before validation.
func lockMediaRow(ctx context.Context, conn *sql.Conn, id int64) (*sql.Tx, error) {
	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, `SELECT id FROM audio_files WHERE id=$1 FOR UPDATE`, id); err != nil {
		tx.Rollback()
		return nil, err
	}
	return tx, nil
}

func waitForMediaRowLock(t *testing.T, ctx context.Context, db *sql.DB, pid int) {
	t.Helper()
	for {
		var waiting bool
		if err := db.QueryRowContext(ctx, `SELECT COALESCE(wait_event_type='Lock', false) FROM pg_stat_activity WHERE pid=$1`, pid).Scan(&waiting); err != nil {
			t.Fatal(err)
		}
		if waiting {
			return
		}
		select {
		case <-ctx.Done():
			t.Fatal(ctx.Err())
		case <-time.After(5 * time.Millisecond):
		}
	}
}

func TestIntegrationMediaValidationChangeRetriesOnceAndReports(t *testing.T) {
	for _, mode := range []string{"retry-succeeds", "retry-deferred", "removed-on-retry", "database-error"} {
		t.Run(mode, func(t *testing.T) {
			f := newMediaFixture(t)
			const changing = "a-busy/changing.m4a"
			f.write(t, changing, "stable", "original")
			f.write(t, "a-busy/missing.m4a", "missing", "missing")
			f.write(t, "z-healthy/removed.m4a", "removed", "removed")
			f.index(t)
			id, key := f.record(t, changing)
			busyMissing, _ := f.record(t, "a-busy/missing.m4a")
			healthyMissing, _ := f.record(t, "z-healthy/removed.m4a")
			f.seedFavoriteAndWaveform(t, id)
			f.remove(t, "a-busy/missing.m4a")
			f.remove(t, "z-healthy/removed.m4a")
			f.write(t, "a-busy/added-before-scan.m4a", "before", "before")
			f.write(t, "z-healthy/new.m4a", "healthy", "healthy")
			if _, err := f.db.db.Exec(`UPDATE audio_files SET indexed_at=NOW()-INTERVAL '1 day'`); err != nil {
				t.Fatal(err)
			}

			if mode == "database-error" {
				if _, err := f.db.db.Exec(`ALTER TABLE audio_files ADD CONSTRAINT test_changed_size CHECK (filename <> 'changing.m4a' OR size <= 8)`); err != nil {
					t.Fatal(err)
				}
			}
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			indexConn, err := f.db.db.Conn(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer indexConn.Close()
			blockConn, err := f.db.db.Conn(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer blockConn.Close()
			var indexPID int
			if err := indexConn.QueryRowContext(ctx, `SELECT pg_backend_pid()`).Scan(&indexPID); err != nil {
				t.Fatal(err)
			}
			blocker, err := lockMediaRow(ctx, blockConn, id)
			if err != nil {
				t.Fatal(err)
			}
			defer blocker.Rollback()
			reporter := NewErrorReporter(f.db.db, "test", ErrorPolicy{}, nil)
			job := &indexJob{conn: indexConn, fs: f.fs, reporter: reporter}
			done := make(chan error, 1)
			go func() { done <- job.rebuildIndex() }()
			waitForMediaRowLock(t, ctx, f.db.db, indexPID)
			f.write(t, changing, "stable", "changed after initial scan")
			f.write(t, "a-busy/added-during-scan.m4a", "during", "during")

			if mode == "retry-succeeds" || mode == "database-error" {
				if err := blocker.Commit(); err != nil {
					t.Fatal(err)
				}
			} else {
				nextConn, err := f.db.db.Conn(ctx)
				if err != nil {
					t.Fatal(err)
				}
				defer nextConn.Close()
				var nextPID int
				if err := nextConn.QueryRowContext(ctx, `SELECT pg_backend_pid()`).Scan(&nextPID); err != nil {
					t.Fatal(err)
				}
				type lockResult struct {
					tx  *sql.Tx
					err error
				}
				nextLocked := make(chan lockResult, 1)
				go func() { tx, err := lockMediaRow(ctx, nextConn, id); nextLocked <- lockResult{tx, err} }()
				// Queue a second blocker after the indexer's first attempt but before its retry.
				waitForMediaRowLock(t, ctx, f.db.db, nextPID)
				if err := blocker.Commit(); err != nil {
					t.Fatal(err)
				}
				next := <-nextLocked
				if next.err != nil {
					t.Fatal(next.err)
				}
				defer next.tx.Rollback()
				waitForMediaRowLock(t, ctx, f.db.db, indexPID)
				if mode == "removed-on-retry" {
					f.remove(t, changing)
				} else {
					f.write(t, changing, "stable", "changed again during retry validation")
				}
				if err := next.tx.Commit(); err != nil {
					t.Fatal(err)
				}
			}
			select {
			case err := <-done:
				if mode == "database-error" {
					if err == nil || errors.Is(err, errIncompleteAudioDirectory) {
						t.Fatalf("database error was deferred: %v", err)
					}
					var retries, failures, deferred int
					if err := f.db.db.QueryRow(`SELECT (context::jsonb->'failureCounts'->>'retry')::int,
                        (context::jsonb->'failureCounts'->>'retry-failed')::int,
                        COALESCE((context::jsonb->'failureCounts'->>'retry-deferred')::int, 0)
                        FROM error_reports WHERE operation='reindex'`).Scan(&retries, &failures, &deferred); err != nil {
						t.Fatal(err)
					}
					if retries != 1 || failures != 1 || deferred != 0 {
						t.Fatalf("retry error not reported: retries=%d failures=%d deferred=%d", retries, failures, deferred)
					}
					return
				}
				if err != nil {
					t.Fatal(err)
				}
			case <-ctx.Done():
				t.Fatal(ctx.Err())
			}

			gotID, gotKey := f.record(t, changing)
			if gotID != id || gotKey != key {
				t.Fatal("identity changed")
			}
			var size int64
			var deleted, cache, likes, busyCount, busyDeleted, healthyDeleted, folderCount int
			if err := f.db.db.QueryRow(`SELECT size, deleted,
    (SELECT count(*) FROM waveform_cache WHERE audio_file_id=$1),
    (SELECT count(*) FROM likes WHERE audio_file_id=$1),
    (SELECT count(*) FROM audio_files WHERE parent_path='audio/a-busy')
    FROM audio_files WHERE id=$1`, id).Scan(&size, &deleted, &cache, &likes, &busyCount); err != nil {
				t.Fatal(err)
			}
			if err := f.db.db.QueryRow(`SELECT deleted FROM audio_files WHERE id=$1`, busyMissing).Scan(&busyDeleted); err != nil {
				t.Fatal(err)
			}
			if err := f.db.db.QueryRow(`SELECT deleted FROM audio_files WHERE id=$1`, healthyMissing).Scan(&healthyDeleted); err != nil {
				t.Fatal(err)
			}
			if err := f.db.db.QueryRow(`SELECT item_count FROM folders WHERE path='audio/z-healthy'`).Scan(&folderCount); err != nil {
				t.Fatal(err)
			}
			if deleted != 0 || likes != 1 || healthyDeleted != 1 || folderCount != 1 {
				t.Fatalf("deleted=%d likes=%d healthyDeleted=%d folderCount=%d", deleted, likes, healthyDeleted, folderCount)
			}
			f.record(t, "z-healthy/new.m4a")
			if mode == "retry-succeeds" {
				f.record(t, "a-busy/added-before-scan.m4a")
				f.record(t, "a-busy/added-during-scan.m4a")
				if size != int64(len("changed after initial scan")) || cache != 0 || busyDeleted != 1 {
					t.Fatalf("retry did not commit fresh state: size=%d cache=%d deleted=%d", size, cache, busyDeleted)
				}
			} else if size != int64(len("original")) || cache != 1 || busyCount != 2 || busyDeleted != 0 {
				t.Fatalf("deferred folder changed: size=%d cache=%d records=%d deleted=%d", size, cache, busyCount, busyDeleted)
			}
			var raw []byte
			var reports int
			if err := f.db.db.QueryRow(`SELECT count(*) FROM error_reports WHERE operation='reindex'`).Scan(&reports); err != nil {
				t.Fatal(err)
			}
			if reports != 1 {
				t.Fatalf("reports=%d want one job summary", reports)
			}
			if err := f.db.db.QueryRow(`SELECT context FROM error_reports WHERE operation='reindex'`).Scan(&raw); err != nil {
				t.Fatal(err)
			}
			var details ErrorContext
			if err := json.Unmarshal(raw, &details); err != nil {
				t.Fatal(err)
			}
			outcome := "retry-succeeded"
			validationFailures := 1
			if mode != "retry-succeeds" {
				outcome = "retry-deferred"
				validationFailures = 2
			}
			if details.FailureCounts["retry"] != 1 || details.FailureCounts[outcome] != 1 || details.FailureCounts["validate"] != validationFailures || details.Message == "" {
				t.Fatalf("missing retry diagnostics: %s", raw)
			}
			foundFile, foundFolder := false, false
			for _, failure := range details.Failures {
				if failure.Step == "validate" && strings.HasSuffix(failure.Resource, changing) {
					foundFile = true
				}
				if failure.Step == outcome && failure.Resource == "audio/a-busy" {
					foundFolder = true
				}
			}
			if !foundFile || !foundFolder {
				t.Fatalf("missing file or outcome context: %s", raw)
			}
		})
	}
}

func TestIntegrationMediaBlockedReadsReleaseDatabaseAndNeverCommitLate(t *testing.T) {
	for _, operation := range []string{"sidecar", "directory", "validation"} {
		t.Run(operation, func(t *testing.T) {
			f := newMediaFixture(t)
			f.write(t, "old.m4a", "stable", "original")
			f.index(t)
			id, key := f.record(t, "old.m4a")
			f.remove(t, "old.m4a")
			f.write(t, "new.m4a", "stable", "replacement")
			f.fs.mediaIO = newMediaFileIO(2)
			started, release := make(chan struct{}), make(chan struct{})
			var once sync.Once
			unblock := func() { once.Do(func() { close(release) }) }
			t.Cleanup(unblock)
			switch operation {
			case "sidecar":
				original := f.fs.mediaIO.readSidecar
				f.fs.mediaIO.readSidecar = func(path string) ([]byte, error) { close(started); <-release; return original(path) }
			case "directory":
				original := f.fs.mediaIO.readDir
				f.fs.mediaIO.readDir = func(path string, limit int) ([]os.DirEntry, error) {
					close(started)
					<-release
					return original(path, limit)
				}
			case "validation":
				original := f.fs.mediaIO.stat
				var newStats int
				f.fs.mediaIO.stat = func(path string) (os.FileInfo, error) {
					if path == filepath.Join(f.dir, "new.m4a") {
						newStats++
						if newStats == 2 {
							close(started)
							<-release
						}
					}
					return original(path)
				}
			}
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			done := make(chan error, 1)
			go func() { done <- RecoverMissingAudio(ctx, f.db.db, f.fs, id) }()
			select {
			case <-started:
			case err := <-done:
				t.Fatalf("recovery did not reach blocking read: %v", err)
			case <-time.After(time.Second):
				t.Fatal("scan did not start")
			}
			cancel()
			select {
			case err := <-done:
				if !errors.Is(err, context.Canceled) {
					t.Fatalf("error=%v", err)
				}
			case <-time.After(time.Second):
				t.Fatal("recovery did not return on cancellation")
			}
			// The filesystem worker is still blocked, but its request's DB resources are free.
			conn, err := f.db.db.Conn(context.Background())
			if err != nil {
				t.Fatal(err)
			}
			defer conn.Close()
			var locked bool
			if err := conn.QueryRowContext(context.Background(), `SELECT pg_try_advisory_lock(hashtextextended('audio-folder:audio',0))`).Scan(&locked); err != nil {
				t.Fatal(err)
			}
			if !locked {
				t.Fatal("canceled scan retained its session lock")
			}
			if _, err := conn.ExecContext(context.Background(), `SELECT pg_advisory_unlock(hashtextextended('audio-folder:audio',0))`); err != nil {
				t.Fatal(err)
			}
			if _, err := conn.ExecContext(context.Background(), `SELECT id FROM audio_files WHERE id=$1 FOR UPDATE NOWAIT`, id); err != nil {
				t.Fatal("canceled scan retained row lock:", err)
			}
			unblock()
			waitMediaWorkers(t, f.fs.mediaIO)
			gotID, gotKey := f.record(t, "old.m4a")
			if gotID != id || gotKey != key {
				t.Fatal("late result changed identity")
			}
			var count int
			if err := f.db.db.QueryRow(`SELECT count(*) FROM audio_files`).Scan(&count); err != nil {
				t.Fatal(err)
			}
			if count != 1 {
				t.Fatal("late result created a record")
			}
			// The independent cooldown still survives cancellation, then a fresh scan can recover.
			if _, err := f.db.db.Exec(`UPDATE media_recovery_attempts SET attempted_at=NOW()-INTERVAL '31 seconds'`); err != nil {
				t.Fatal(err)
			}
			f.fs.mediaIO = newMediaFileIO(2)
			if err := RecoverMissingAudio(context.Background(), f.db.db, f.fs, id); err != nil {
				t.Fatal(err)
			}
			gotID, gotKey = f.record(t, "new.m4a")
			if gotID != id || gotKey != key {
				t.Fatal("fresh recovery changed identity")
			}
		})
	}
}

func TestIntegrationMediaOldPathErrorsDeferFolderWithoutSplittingIdentity(t *testing.T) {
	for _, statErr := range []error{syscall.EIO, syscall.EACCES} {
		t.Run(statErr.Error(), func(t *testing.T) {
			f := newMediaFixture(t)
			oldName, newName := "affected/old.m4a", "affected/new.m4a"
			f.write(t, oldName, "stable", "original")
			f.write(t, "healthy/removed.m4a", "removed", "original")
			f.index(t)
			id, key := f.record(t, oldName)
			removed, _ := f.record(t, "healthy/removed.m4a")
			f.seedFavoriteAndWaveform(t, id)
			if _, err := f.db.db.Exec(`UPDATE audio_files SET indexed_at=NOW()-INTERVAL '1 day'`); err != nil {
				t.Fatal(err)
			}
			f.remove(t, oldName)
			f.remove(t, "healthy/removed.m4a")
			f.write(t, newName, "stable", "replacement")
			f.write(t, "affected/a-neighbor.m4a", "neighbor", "new")
			f.write(t, "healthy/new.m4a", "healthy", "new")
			f.fs.mediaIO = newMediaFileIO(8)
			oldFull := filepath.Join(f.dir, oldName)
			f.fs.mediaIO.stat = func(path string) (os.FileInfo, error) {
				if path == oldFull {
					return nil, &os.PathError{Op: "stat", Path: path, Err: statErr}
				}
				return os.Stat(path)
			}
			f.db.Errors = NewErrorReporter(f.db.db, "test", ErrorPolicy{}, nil)
			f.index(t)
			var count, deleted, likes, cache int
			if err := f.db.db.QueryRow(`SELECT deleted,
				(SELECT count(*) FROM audio_files WHERE parent_path='audio/affected'),
				(SELECT count(*) FROM likes WHERE audio_file_id=$1),
				(SELECT count(*) FROM waveform_cache WHERE audio_file_id=$1)
				FROM audio_files WHERE id=$1`, id).Scan(&deleted, &count, &likes, &cache); err != nil {
				t.Fatal(err)
			}
			if deleted != 0 || count != 1 || likes != 1 || cache != 1 {
				t.Fatalf("deferred folder changed: deleted=%d records=%d likes=%d cache=%d", deleted, count, likes, cache)
			}
			if gotID, gotKey := f.record(t, oldName); gotID != id || gotKey != key {
				t.Fatal("deferred record changed identity")
			}
			f.record(t, "healthy/new.m4a")
			if err := f.db.db.QueryRow(`SELECT deleted FROM audio_files WHERE id=$1`, removed).Scan(&deleted); err != nil || deleted != 1 {
				t.Fatalf("healthy deletion reconciliation: deleted=%d err=%v", deleted, err)
			}
			var raw []byte
			if err := f.db.db.QueryRow(`SELECT context FROM error_reports WHERE operation='reindex'`).Scan(&raw); err != nil {
				t.Fatal(err)
			}
			var details ErrorContext
			if err := json.Unmarshal(raw, &details); err != nil {
				t.Fatal(err)
			}
			found := false
			for _, failure := range details.Failures {
				if failure.Step == "stat" && failure.Resource == oldFull {
					found = true
				}
			}
			if !found || details.FailureCounts["deferred"] != 1 {
				t.Fatalf("missing error diagnostics: %s", raw)
			}
			f.fs.mediaIO = newMediaFileIO(8)
			f.index(t)
			if gotID, gotKey := f.record(t, newName); gotID != id || gotKey != key {
				t.Fatal("replacement changed identity after storage recovered")
			}
			if err := f.db.db.QueryRow(`SELECT count(*) FROM audio_files WHERE media_id='stable'`).Scan(&count); err != nil || count != 1 {
				t.Fatalf("duplicate identity: count=%d err=%v", count, err)
			}
		})
	}
}

func TestIntegrationMediaIdentityFollowsSwappedPaths(t *testing.T) {
	for _, length := range []int{2, 3} {
		t.Run(fmt.Sprintf("%d-track-cycle", length), func(t *testing.T) {
			f := newMediaFixture(t)
			ids, keys := make([]int64, length), make([]string, length)
			for i := range length {
				f.write(t, fmt.Sprintf("track-%d.m4a", i), fmt.Sprintf("stable-%d", i), fmt.Sprintf("audio-%d", i))
			}
			f.index(t)
			for i := range length {
				ids[i], keys[i] = f.record(t, fmt.Sprintf("track-%d.m4a", i))
				if _, err := f.db.db.Exec(`INSERT INTO play_events(audio_file_id,session_id) VALUES($1,$2)`, ids[i], fmt.Sprintf("listener-%d", i)); err != nil {
					t.Fatal(err)
				}
			}
			f.seedFavoriteAndWaveform(t, ids[0])
			for i := range length {
				f.write(t, fmt.Sprintf("track-%d.m4a", (i+1)%length), fmt.Sprintf("stable-%d", i), fmt.Sprintf("audio-%d", i))
			}
			f.index(t)
			for i := range length {
				name := fmt.Sprintf("track-%d.m4a", (i+1)%length)
				if id, key := f.record(t, name); id != ids[i] || key != keys[i] {
					t.Fatalf("track %d followed its filename instead of its identity: id=%d key=%s", i, id, key)
				}
				var mediaID, session string
				if err := f.db.db.QueryRow(`SELECT a.media_id,p.session_id FROM audio_files a JOIN play_events p ON p.audio_file_id=a.id WHERE a.id=$1`, ids[i]).Scan(&mediaID, &session); err != nil {
					t.Fatal(err)
				}
				if mediaID != fmt.Sprintf("stable-%d", i) || session != fmt.Sprintf("listener-%d", i) {
					t.Fatalf("identity/history changed: media=%s session=%s", mediaID, session)
				}
			}
			var likes, cache, count int
			if err := f.db.db.QueryRow(`SELECT (SELECT count(*) FROM likes WHERE audio_file_id=$1), (SELECT count(*) FROM waveform_cache WHERE audio_file_id=$1), (SELECT count(*) FROM audio_files)`, ids[0]).Scan(&likes, &cache, &count); err != nil {
				t.Fatal(err)
			}
			if likes != 1 || cache != 0 || count != length {
				t.Fatalf("likes=%d cache=%d records=%d", likes, cache, count)
			}
			f.index(t)
			for i := range length {
				if id, key := f.record(t, fmt.Sprintf("track-%d.m4a", (i+1)%length)); id != ids[i] || key != keys[i] {
					t.Fatal("repeat index changed identity")
				}
			}
		})
	}
}

func TestIntegrationMediaConflictingPathDefersFolder(t *testing.T) {
	f := newMediaFixture(t)
	f.write(t, "affected/a.m4a", "A", "audio A")
	f.write(t, "affected/b.m4a", "B", "audio B")
	f.index(t)
	a, aKey := f.record(t, "affected/a.m4a")
	b, bKey := f.record(t, "affected/b.m4a")
	f.seedFavoriteAndWaveform(t, a)
	f.write(t, "affected/a.m4a", "B", "audio B")
	f.write(t, "affected/b.m4a", "A", "audio A")
	f.write(t, "affected/duplicate.m4a", "A", "duplicate audio A")
	f.write(t, "healthy/new.m4a", "healthy", "new audio")
	f.db.Errors = NewErrorReporter(f.db.db, "test", ErrorPolicy{}, nil)
	f.index(t)
	for id, key := range map[int64]string{a: aKey, b: bKey} {
		var gotKey string
		var deleted int
		var conflicted bool
		if err := f.db.db.QueryRow(`SELECT share_key,deleted,identity_conflicted FROM audio_files WHERE id=$1`, id).Scan(&gotKey, &deleted, &conflicted); err != nil {
			t.Fatal(err)
		}
		if gotKey != key || deleted != 1 || !conflicted {
			t.Fatalf("conflicting record not preserved and blocked: key=%s deleted=%d conflicted=%v", gotKey, deleted, conflicted)
		}
	}
	var count, likes, cache int
	if err := f.db.db.QueryRow(`SELECT
		(SELECT count(*) FROM audio_files WHERE parent_path='audio/affected'),
		(SELECT count(*) FROM likes WHERE audio_file_id=$1),
		(SELECT count(*) FROM waveform_cache WHERE audio_file_id=$1)`, a).Scan(&count, &likes, &cache); err != nil {
		t.Fatal(err)
	}
	if count != 2 || likes != 1 || cache != 0 {
		t.Fatalf("deferred records: records=%d likes=%d cache=%d", count, likes, cache)
	}
	f.record(t, "healthy/new.m4a")
	var raw []byte
	if err := f.db.db.QueryRow(`SELECT context FROM error_reports WHERE operation='reindex'`).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var details ErrorContext
	if err := json.Unmarshal(raw, &details); err != nil {
		t.Fatal(err)
	}
	if details.FailureCounts["identity"] != 1 || details.FailureCounts["identity-blocked"] != 2 || details.FailureCounts["deferred"] != 1 {
		t.Fatalf("missing conflict diagnostics: %s", raw)
	}
	// Repeated indexing must not turn a blocked ambiguity into new identities.
	f.index(t)
	if err := f.db.db.QueryRow(`SELECT count(*) FROM audio_files WHERE parent_path='audio/affected'`).Scan(&count); err != nil || count != 2 {
		t.Fatalf("repeated conflict split records: count=%d err=%v", count, err)
	}
	// The conflict flags survive deferral, then clear when the ambiguity is resolved.
	f.remove(t, "affected/duplicate.m4a")
	f.index(t)
	for name, want := range map[string]int64{"affected/a.m4a": b, "affected/b.m4a": a} {
		id, _ := f.record(t, name)
		var conflicted bool
		if err := f.db.db.QueryRow(`SELECT identity_conflicted FROM audio_files WHERE id=$1 AND deleted=0`, want).Scan(&conflicted); err != nil || conflicted || id != want {
			t.Fatalf("resolved identity: id=%d want=%d conflicted=%v err=%v", id, want, conflicted, err)
		}
	}
}

func TestIntegrationMediaFilenameReusePreservesHistory(t *testing.T) {
	for _, mode := range []string{"deleted", "active-replacement"} {
		t.Run(mode, func(t *testing.T) {
			f := newMediaFixture(t)
			f.write(t, "affected/track.m4a", "A", "audio A")
			f.write(t, "affected/removed.m4a", "removed", "removed audio")
			f.index(t)
			a, aKey := f.record(t, "affected/track.m4a")
			removed, _ := f.record(t, "affected/removed.m4a")
			f.seedFavoriteAndWaveform(t, a)
			if _, err := f.db.db.Exec(`INSERT INTO play_events(audio_file_id) VALUES($1)`, a); err != nil {
				t.Fatal(err)
			}
			if mode == "deleted" {
				f.remove(t, "affected/track.m4a")
				if _, err := f.db.db.Exec(`UPDATE audio_files SET indexed_at=NOW()-INTERVAL '1 day'`); err != nil {
					t.Fatal(err)
				}
				f.index(t)
			}
			f.write(t, "affected/track.m4a", "B", "audio B")
			f.write(t, "affected/new.m4a", "new", "new audio")
			f.remove(t, "affected/removed.m4a")
			if _, err := f.db.db.Exec(`UPDATE audio_files SET indexed_at=NOW()-INTERVAL '1 day'`); err != nil {
				t.Fatal(err)
			}
			f.db.Errors = NewErrorReporter(f.db.db, "test", ErrorPolicy{}, nil)
			f.index(t)
			b, bKey := f.record(t, "affected/track.m4a")
			if b == a || bKey == aKey {
				t.Fatal("different recording reused the original identity")
			}
			f.record(t, "affected/new.m4a")
			var deleted, likes, plays, count int
			var conflicted bool
			var gotKey, mediaID string
			var ownedPath sql.NullString
			if err := f.db.db.QueryRow(`SELECT share_key,media_id,deleted,identity_conflicted,active_path,
				(SELECT count(*) FROM likes WHERE audio_file_id=$1),
				(SELECT count(*) FROM play_events WHERE audio_file_id=$1)
				FROM audio_files WHERE id=$1`, a).Scan(&gotKey, &mediaID, &deleted, &conflicted, &ownedPath, &likes, &plays); err != nil {
				t.Fatal(err)
			}
			if gotKey != aKey || mediaID != "A" || deleted != 1 || conflicted != (mode == "active-replacement") || ownedPath.Valid || likes != 1 || plays != 1 {
				t.Fatalf("historical record: key=%s media=%s deleted=%d conflicted=%v owner=%v likes=%d plays=%d", gotKey, mediaID, deleted, conflicted, ownedPath, likes, plays)
			}
			if err := f.db.db.QueryRow(`SELECT deleted FROM audio_files WHERE id=$1`, removed).Scan(&deleted); err != nil || deleted != 1 {
				t.Fatalf("neighbor deletion: deleted=%d err=%v", deleted, err)
			}
			var reports int
			if err := f.db.db.QueryRow(`SELECT count(*) FROM error_reports WHERE operation='reindex'`).Scan(&reports); err != nil {
				t.Fatal(err)
			}
			if (mode == "active-replacement" && reports != 1) || (mode == "deleted" && reports != 0) {
				t.Fatalf("reports=%d", reports)
			}
			f.index(t)
			if id, key := f.record(t, "affected/track.m4a"); id != b || key != bKey {
				t.Fatal("repeat index changed replacement identity")
			}
			f.write(t, "affected/restored.m4a", "A", "audio A restored")
			f.index(t)
			if id, key := f.record(t, "affected/restored.m4a"); id != a || key != aKey {
				t.Fatal("returning original did not recover its identity")
			}
			if err := f.db.db.QueryRow(`SELECT identity_conflicted,deleted FROM audio_files WHERE id=$1`, a).Scan(&conflicted, &deleted); err != nil || conflicted || deleted != 0 {
				t.Fatalf("restored record still blocked: conflict=%v deleted=%d err=%v", conflicted, deleted, err)
			}
			if err := f.db.db.QueryRow(`SELECT count(*) FROM audio_files WHERE media_id IN ('A','B')`).Scan(&count); err != nil || count != 2 {
				t.Fatalf("duplicate records: count=%d err=%v", count, err)
			}
		})
	}
}

func TestIntegrationMediaConflictBlockSurvivesValidationRollback(t *testing.T) {
	f := newMediaFixture(t)
	f.write(t, "affected/track.m4a", "A", "audio A")
	f.index(t)
	a, key := f.record(t, "affected/track.m4a")
	f.seedFavoriteAndWaveform(t, a)
	f.write(t, "affected/track.m4a", "B", "audio B")
	f.write(t, "affected/a-neighbor.m4a", "neighbor", "new audio")
	f.write(t, "healthy/new.m4a", "healthy", "new audio")
	f.fs.mediaIO = newMediaFileIO(8)
	var checks int
	f.fs.mediaIO.stat = func(path string) (os.FileInfo, error) {
		if path == filepath.Join(f.dir, "affected/track.m4a") {
			checks++
			if checks%2 == 0 {
				return nil, &os.PathError{Op: "stat", Path: path, Err: syscall.EIO}
			}
		}
		return os.Stat(path)
	}
	f.db.Errors = NewErrorReporter(f.db.db, "test", ErrorPolicy{}, nil)
	f.index(t)
	var count, deleted, cache int
	var conflicted bool
	var gotKey string
	if err := f.db.db.QueryRow(`SELECT share_key,deleted,identity_conflicted,
		(SELECT count(*) FROM audio_files WHERE parent_path='audio/affected'),
		(SELECT count(*) FROM waveform_cache WHERE audio_file_id=$1)
		FROM audio_files WHERE id=$1`, a).Scan(&gotKey, &deleted, &conflicted, &count, &cache); err != nil {
		t.Fatal(err)
	}
	if gotKey != key || deleted != 1 || !conflicted || count != 1 || cache != 0 {
		t.Fatalf("failed rollback/block: key=%s deleted=%d conflicted=%v records=%d cache=%d", gotKey, deleted, conflicted, count, cache)
	}
	f.record(t, "healthy/new.m4a")
	var raw []byte
	if err := f.db.db.QueryRow(`SELECT context FROM error_reports WHERE operation='reindex'`).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var details ErrorContext
	if err := json.Unmarshal(raw, &details); err != nil {
		t.Fatal(err)
	}
	if details.FailureCounts["identity-blocked"] != 1 || details.FailureCounts["validate"] != 2 || details.FailureCounts["retry-deferred"] != 1 {
		t.Fatalf("missing rollback diagnostics: %s", raw)
	}
	f.fs.mediaIO = newMediaFileIO(8)
	f.index(t)
	f.record(t, "affected/a-neighbor.m4a")
	if id, newKey := f.record(t, "affected/track.m4a"); id == a || newKey == key {
		t.Fatal("replacement reused blocked identity after storage recovered")
	}
}

func TestIntegrationMediaIncompleteSidecarsStillBlockKnownMismatches(t *testing.T) {
	for _, mode := range []string{"missing", "malformed"} {
		for _, brokenName := range []string{"a-broken", "z-broken"} {
			t.Run(mode+"/"+brokenName, func(t *testing.T) {
				f := newMediaFixture(t)
				f.write(t, "affected/track.m4a", "A", "audio A")
				f.write(t, "affected/missing.m4a", "missing", "missing audio")
				f.write(t, "affected/"+brokenName+".m4a", "broken", "neighbor audio")
				f.index(t)
				a, key := f.record(t, "affected/track.m4a")
				missing, _ := f.record(t, "affected/missing.m4a")
				f.seedFavoriteAndWaveform(t, a)
				f.write(t, "affected/track.m4a", "B", "audio B")
				f.write(t, "affected/restored.m4a", "A", "audio A restored")
				f.write(t, "healthy/new.m4a", "healthy", "new audio")
				f.remove(t, "affected/missing.m4a")
				sidecar := filepath.Join(f.dir, "affected", brokenName+".info.json")
				if mode == "missing" {
					if err := os.Remove(sidecar); err != nil {
						t.Fatal(err)
					}
				} else if err := os.WriteFile(sidecar, []byte(`{"id":`), 0600); err != nil {
					t.Fatal(err)
				}
				if _, err := f.db.db.Exec(`UPDATE audio_files SET indexed_at=NOW()-INTERVAL '1 day'`); err != nil {
					t.Fatal(err)
				}
				f.db.Errors = NewErrorReporter(f.db.db, "test", ErrorPolicy{}, nil)
				for range 2 {
					f.index(t)
					var conflicted bool
					var deleted, count, likes, cache int
					var gotKey, mediaID string
					if err := f.db.db.QueryRow(`SELECT share_key,media_id,deleted,identity_conflicted,
						(SELECT count(*) FROM audio_files WHERE parent_path='audio/affected'),
						(SELECT count(*) FROM likes WHERE audio_file_id=$1),
						(SELECT count(*) FROM waveform_cache WHERE audio_file_id=$1)
						FROM audio_files WHERE id=$1`, a).Scan(&gotKey, &mediaID, &deleted, &conflicted, &count, &likes, &cache); err != nil {
						t.Fatal(err)
					}
					if gotKey != key || mediaID != "A" || deleted != 1 || !conflicted || count != 3 || likes != 1 || cache != 0 {
						t.Fatalf("incomplete scan: key=%s media=%s deleted=%d conflicted=%v records=%d likes=%d cache=%d", gotKey, mediaID, deleted, conflicted, count, likes, cache)
					}
					if err := f.db.db.QueryRow(`SELECT deleted FROM audio_files WHERE id=$1`, missing).Scan(&deleted); err != nil || deleted != 0 {
						t.Fatalf("incomplete scan applied deletion: deleted=%d err=%v", deleted, err)
					}
				}
				f.record(t, "healthy/new.m4a")
				var reports int
				if err := f.db.db.QueryRow(`SELECT count(*) FROM error_reports WHERE operation='reindex'
					AND (context->'failureCounts'->>'identity-blocked')::int=1
					AND (context->'failureCounts'->>'deferred')::int=1`).Scan(&reports); err != nil || reports == 0 {
					t.Fatalf("missing block/deferral report: reports=%d err=%v", reports, err)
				}
				f.write(t, "affected/"+brokenName+".m4a", "broken", "neighbor audio")
				f.index(t)
				if id, gotKey := f.record(t, "affected/restored.m4a"); id != a || gotKey != key {
					t.Fatal("successful scan did not restore the original identity")
				}
				if id, _ := f.record(t, "affected/track.m4a"); id == a {
					t.Fatal("replacement inherited original identity")
				}
			})
		}
	}
}

func TestIntegrationMediaDuplicateIDRestoresUniqueHistoricalPath(t *testing.T) {
	for _, ambiguous := range []bool{false, true} {
		t.Run(fmt.Sprintf("ambiguous-history=%v", ambiguous), func(t *testing.T) {
			f := newMediaFixture(t)
			f.write(t, "affected/first.m4a", "shared", "first audio")
			f.write(t, "affected/second.m4a", "shared", "second audio")
			f.index(t)
			first, firstKey := f.record(t, "affected/first.m4a")
			second, secondKey := f.record(t, "affected/second.m4a")
			f.seedFavoriteAndWaveform(t, first)
			if _, err := f.db.db.Exec(`INSERT INTO play_events(audio_file_id) VALUES($1)`, first); err != nil {
				t.Fatal(err)
			}
			f.remove(t, "affected/first.m4a")
			if _, err := f.db.db.Exec(`UPDATE audio_files SET indexed_at=NOW()-INTERVAL '1 day'`); err != nil {
				t.Fatal(err)
			}
			f.index(t)
			if ambiguous {
				if _, err := f.db.db.Exec(`INSERT INTO audio_files(path,parent_path,filename,media_id,share_key,deleted)
					VALUES('audio/affected/first.m4a','audio/affected','first.m4a','shared','historical-duplicate',1)`); err != nil {
					t.Fatal(err)
				}
			}
			f.write(t, "affected/first.m4a", "shared", "first audio")
			f.write(t, "healthy/new.m4a", "healthy", "new audio")
			f.db.Errors = NewErrorReporter(f.db.db, "test", ErrorPolicy{}, nil)
			for range 2 {
				f.index(t)
				var count, deleted, likes, plays int
				var gotKey string
				if err := f.db.db.QueryRow(`SELECT share_key,deleted,
					(SELECT count(*) FROM audio_files WHERE parent_path='audio/affected'),
					(SELECT count(*) FROM likes WHERE audio_file_id=$1),
					(SELECT count(*) FROM play_events WHERE audio_file_id=$1)
					FROM audio_files WHERE id=$1`, first).Scan(&gotKey, &deleted, &count, &likes, &plays); err != nil {
					t.Fatal(err)
				}
				wantCount, wantDeleted := 2, 0
				if ambiguous {
					wantCount, wantDeleted = 3, 1
				}
				if gotKey != firstKey || deleted != wantDeleted || count != wantCount || likes != 1 || plays != 1 {
					t.Fatalf("historical match: key=%s deleted=%d records=%d likes=%d plays=%d", gotKey, deleted, count, likes, plays)
				}
				if !ambiguous {
					if id, key := f.record(t, "affected/first.m4a"); id != first || key != firstKey {
						t.Fatal("restored file lost its original identity")
					}
				}
				if id, key := f.record(t, "affected/second.m4a"); id != second || key != secondKey {
					t.Fatal("duplicate neighbor changed identity")
				}
			}
			f.record(t, "healthy/new.m4a")
			if ambiguous {
				var reports int
				if err := f.db.db.QueryRow(`SELECT count(*) FROM error_reports WHERE operation='reindex'
					AND (context->'failureCounts'->>'identity')::int=1
					AND (context->'failureCounts'->>'deferred')::int=1`).Scan(&reports); err != nil || reports == 0 {
					t.Fatalf("missing ambiguity report: reports=%d err=%v", reports, err)
				}
			}
		})
	}
}

func TestIntegrationMediaInitialBackfillTrustsSidecarOverTitleTags(t *testing.T) {
	for _, tag := range []string{"Compilation", "Size Difference", "Handholding"} {
		for _, incomplete := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/incomplete=%v", tag, incomplete), func(t *testing.T) {
				f := newMediaFixture(t)
				name := "track [" + tag + "].m4a"
				f.write(t, name, "real-id", "original audio")
				f.index(t)
				id, key := f.record(t, name)
				f.seedFavoriteAndWaveform(t, id)
				if _, err := f.db.db.Exec(`INSERT INTO play_events(audio_file_id) VALUES($1)`, id); err != nil {
					t.Fatal(err)
				}
				if _, err := f.db.db.Exec(`UPDATE audio_files SET media_id=NULL WHERE id=$1`, id); err != nil {
					t.Fatal(err)
				}
				if incomplete {
					f.write(t, "broken.m4a", "broken", "neighbor audio")
					if err := os.Remove(filepath.Join(f.dir, "broken.info.json")); err != nil {
						t.Fatal(err)
					}
					f.index(t)
					var mediaID sql.NullString
					var deleted int
					var conflicted bool
					if err := f.db.db.QueryRow(`SELECT media_id,deleted,identity_conflicted FROM audio_files WHERE id=$1`, id).Scan(&mediaID, &deleted, &conflicted); err != nil {
						t.Fatal(err)
					}
					if mediaID.Valid || deleted != 0 || conflicted {
						t.Fatalf("incomplete backfill changed record: id=%v deleted=%d conflicted=%v", mediaID, deleted, conflicted)
					}
					f.write(t, "broken.m4a", "broken", "neighbor audio")
				}
				for range 2 {
					f.index(t)
					if gotID, gotKey := f.record(t, name); gotID != id || gotKey != key {
						t.Fatal("backfill changed share identity")
					}
					var mediaID string
					var likes, plays, count, cache, deleted int
					var conflicted bool
					if err := f.db.db.QueryRow(`SELECT media_id,deleted,identity_conflicted,
						(SELECT count(*) FROM likes WHERE audio_file_id=$1),
						(SELECT count(*) FROM play_events WHERE audio_file_id=$1),
						(SELECT count(*) FROM audio_files WHERE path=$2),
						(SELECT count(*) FROM waveform_cache WHERE audio_file_id=$1)
						FROM audio_files WHERE id=$1`, id, "audio/"+name).Scan(&mediaID, &deleted, &conflicted, &likes, &plays, &count, &cache); err != nil {
						t.Fatal(err)
					}
					if mediaID != "real-id" || deleted != 0 || conflicted || likes != 1 || plays != 1 || count != 1 || cache != 1 {
						t.Fatalf("backfill: media=%s deleted=%d conflicted=%v likes=%d plays=%d records=%d cache=%d", mediaID, deleted, conflicted, likes, plays, count, cache)
					}
				}
				// After backfill, a different sidecar ID must no longer reuse the record.
				f.write(t, name, "different-id", "replacement audio")
				f.index(t)
				if gotID, gotKey := f.record(t, name); gotID == id || gotKey == key {
					t.Fatal("stored identity was overwritten by a later replacement")
				}
				var conflicted bool
				if err := f.db.db.QueryRow(`SELECT identity_conflicted FROM audio_files WHERE id=$1 AND deleted=1`, id).Scan(&conflicted); err != nil || !conflicted {
					t.Fatalf("stored identity not protected: conflict=%v err=%v", conflicted, err)
				}
			})
		}
	}
}

func TestIntegrationMediaBlockPersistenceFailureAbortsIndex(t *testing.T) {
	f := newMediaFixture(t)
	f.write(t, "track.m4a", "A", "audio A")
	f.index(t)
	f.write(t, "track.m4a", "B", "audio B")
	f.write(t, "broken.m4a", "broken", "neighbor audio")
	if err := os.Remove(filepath.Join(f.dir, "broken.info.json")); err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.db.Exec(`CREATE FUNCTION reject_conflict_commit() RETURNS trigger LANGUAGE plpgsql AS $$
		BEGIN
			IF NEW.identity_conflicted THEN RAISE EXCEPTION 'test commit failure'; END IF;
			RETURN NEW;
		END $$;
		CREATE CONSTRAINT TRIGGER reject_conflict_commit AFTER UPDATE ON audio_files
		DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_conflict_commit()`); err != nil {
		t.Fatal(err)
	}
	f.db.Errors = NewErrorReporter(f.db.db, "test", ErrorPolicy{}, nil)
	err := NewSearchService(f.db, f.fs, nil).RebuildIndex()
	if err == nil || errors.Is(err, errIncompleteAudioDirectory) {
		t.Fatalf("failed conflict persistence must abort indexing, error=%v", err)
	}
	var reports int
	if err := f.db.db.QueryRow(`SELECT count(*) FROM error_reports WHERE operation='reindex' AND outcome='blocked'`).Scan(&reports); err != nil || reports == 0 {
		t.Fatalf("missing failed-index report: reports=%d err=%v", reports, err)
	}
}
