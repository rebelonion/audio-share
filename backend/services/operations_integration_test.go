package services

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestIntegrationLibraryHealthCountsAndPrivateDiagnostics(t *testing.T) {
	db := integrationDatabase(t)
	if err := db.Migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, err := db.db.Exec(`
        INSERT INTO folders(path,folder_name,name) VALUES ('audio','audio','Audio');
        INSERT INTO audio_files(path,filename,share_key,file_mtime_ns) VALUES
            ('audio/ready.wav','ready.wav','ready',1), ('audio/pending.wav','pending.wav','pending',1), ('audio/legacy.wav','legacy.wav','legacy',NULL);
        UPDATE audio_files SET unavailable_at=NOW(),removal_requested_at=NOW() WHERE share_key='pending';
        UPDATE audio_files SET share_key=NULL WHERE share_key='legacy';
        INSERT INTO audio_files(path,filename,share_key,deleted,identity_conflicted,media_id) VALUES ('audio/conflict.wav','conflict.wav','conflict',1,true,'duplicate');
        INSERT INTO audio_files(path,filename,share_key,deleted,identity_conflicted,media_id) VALUES ('audio/conflict.wav','conflict.wav',NULL,1,true,'older-identity');
        INSERT INTO waveform_cache(audio_file_id,peaks,duration_seconds) SELECT id,'AA==',1 FROM audio_files WHERE share_key='ready';
        INSERT INTO error_reports(fingerprint,origin,operation,stage,cause,outcome,source_hash,context)
        VALUES('test','worker','reindex','run','io','degraded','private-source','{"message":"token=private-token read failed"}');
    `); err != nil {
		t.Fatal(err)
	}
	health, err := ReadLibraryHealth(context.Background(), db.db)
	if err != nil {
		t.Fatal(err)
	}
	want := LibraryCounts{Tracks: 3, Folders: 1, Deleted: 2, Unavailable: 1, RemovalRequested: 1, IdentityConflicts: 2, WaveformReady: 1, WaveformPending: 1, AwaitingIndex: 1}
	if health.Library != want {
		t.Fatalf("counts=%+v want=%+v", health.Library, want)
	}
	if len(health.PendingWaveforms) != 2 || len(health.Conflicts) != 2 || health.Conflicts[0].ID == health.Conflicts[1].ID || health.Conflicts[0].ID == 0 {
		t.Fatalf("samples=%+v", health)
	}
	if len(health.Errors) != 1 || strings.Contains(health.Errors[0].Context.Message, "private-token") {
		t.Fatalf("errors=%+v", health.Errors)
	}
}

func TestIntegrationJobHistoryTracksLockLifetimeAndOutcomes(t *testing.T) {
	db := integrationDatabase(t)
	if err := db.Migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	read := func() *LibraryHealth {
		t.Helper()
		h, err := ReadLibraryHealth(context.Background(), db.db)
		if err != nil {
			t.Fatal(err)
		}
		return h
	}
	err := withJobLock(db.db, "reindex", func(conn *sql.Conn) error {
		run := beginJobRun(conn, "reindex")
		if run == nil {
			t.Fatal("history not recorded")
		}
		if state := read().Jobs[0].State; state != "running" {
			t.Fatalf("active state=%s", state)
		}
		run.finish(JobSummary{Folders: 4}, nil)
		if state := read().Jobs[0].State; state != "succeeded" {
			t.Fatalf("finished state=%s", state)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if read().LastSuccess["reindex"].IsZero() {
		t.Fatal("missing last success")
	}
	err = withJobLock(db.db, "waveform", func(conn *sql.Conn) error {
		if beginJobRun(conn, "waveform") == nil {
			t.Fatal("history not recorded")
		}
		return nil // Simulate a worker disappearing without recording a finish.
	})
	if err != nil {
		t.Fatal(err)
	}
	if state := read().Jobs[0].State; state != "interrupted" {
		t.Fatalf("abandoned state=%s", state)
	}
	err = withJobLock(db.db, "waveform", func(conn *sql.Conn) error {
		run := beginJobRun(conn, "waveform")
		run.finish(JobSummary{Attempted: 3, Processed: 2, Issues: 1, Details: ErrorContext{Message: "password=private"}}, nil)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	health := read()
	if health.Jobs[0].State != "degraded" || health.Jobs[1].State != "interrupted" {
		t.Fatalf("jobs=%+v", health.Jobs)
	}
	if health.Jobs[1].FinishedAt != nil {
		t.Fatal("interrupted run has invented completion time")
	}
	if strings.Contains(health.Jobs[0].Summary.Details.Message, "private") {
		t.Fatal("job history leaked secret")
	}
	err = withJobLock(db.db, "reindex", func(conn *sql.Conn) error {
		run := beginJobRun(conn, "reindex")
		run.finish(JobSummary{}, errors.New("disk unavailable"))
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if state := read().Jobs[0].State; state != "failed" {
		t.Fatalf("failed state=%s", state)
	}
}

func TestIntegrationReindexRecordsHistoryWithoutErrorReporter(t *testing.T) {
	f := newMediaFixture(t)
	f.index(t)
	health, err := ReadLibraryHealth(context.Background(), f.db.db)
	if err != nil {
		t.Fatal(err)
	}
	if len(health.Jobs) != 1 || health.Jobs[0].State != "succeeded" || health.Jobs[0].Summary.Folders != 1 {
		t.Fatalf("jobs=%+v", health.Jobs)
	}
}

func TestIntegrationWaveformHistoryReportsDiscardedResults(t *testing.T) {
	for _, name := range []string{"ffmpeg", "ffprobe"} {
		if _, err := exec.LookPath(name); err != nil {
			t.Skip(name + " required for waveform integration")
		}
	}
	for _, change := range []string{"none", "file", "revision"} {
		t.Run(change, func(t *testing.T) {
			db := integrationDatabase(t)
			if err := db.Migrate(context.Background()); err != nil {
				t.Fatal(err)
			}
			directory := t.TempDir()
			path := filepath.Join(directory, "track.wav")
			if output, err := exec.Command("ffmpeg", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", path).CombinedOutput(); err != nil {
				t.Fatalf("generate audio: %v: %s", err, output)
			}
			if err := os.WriteFile(filepath.Join(directory, "track.info.json"), []byte(`{}`), 0600); err != nil {
				t.Fatal(err)
			}
			fs := NewFileSystemService(directory + ":Audio")
			if err := NewSearchService(db, fs, nil).RebuildIndex(); err != nil {
				t.Fatal(err)
			}
			fs.mediaIO = newMediaFileIO(1)
			// Change the source after generation but before publication.
			fs.mediaIO.stat = func(path string) (os.FileInfo, error) {
				if change == "file" {
					if err := os.WriteFile(path, []byte("replacement"), 0600); err != nil {
						return nil, err
					}
				} else if change == "revision" {
					if _, err := db.db.Exec(`UPDATE audio_files SET media_revision=media_revision+1`); err != nil {
						return nil, err
					}
				}
				return os.Stat(path)
			}
			if err := NewWaveformService(db.db, fs, 1).RunJob(time.Minute); err != nil {
				t.Fatal(err)
			}
			health, err := ReadLibraryHealth(context.Background(), db.db)
			if err != nil {
				t.Fatal(err)
			}
			run := health.Jobs[0]
			if change == "none" {
				if run.State != "succeeded" || run.Summary.Processed != 1 || health.Library.WaveformReady != 1 {
					t.Fatalf("successful result: %+v", run)
				}
			} else if run.State != "degraded" || run.Summary.Processed != 0 || run.Summary.Issues != 1 || len(run.Summary.Details.Failures) != 1 || health.Library.WaveformReady != 0 {
				t.Fatalf("discarded result: %+v", run)
			}
		})
	}
}
