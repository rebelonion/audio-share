package services

import (
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

var testPlaybackKeyExpiry = time.Date(2026, time.July, 26, 12, 30, 0, 0, time.UTC)

func TestRecordPlayEventSerializesAndStoresAccessKeyNonce(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	service := &PlaybackService{db: &Database{db: db}}
	mock.ExpectQuery(regexp.QuoteMeta(
		"SELECT id FROM audio_files WHERE share_key = $1 AND deleted = 0",
	)).
		WithArgs("track-key").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(42))
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta(
		"SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
	)).
		WithArgs("42:session-one").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO playback_access_keys").
		WithArgs("nonce-one", testPlaybackKeyExpiry).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectQuery(regexp.QuoteMeta(
		"SELECT COUNT(*) FROM play_events WHERE audio_file_id = $1 AND session_id = $2 AND played_at > NOW() - INTERVAL '5 minutes'",
	)).
		WithArgs(int64(42), "session-one").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectExec("INSERT INTO play_events").
		WithArgs(int64(42), "session-one", "listening-one", "browse", "nonce-one").
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	if err := service.RecordPlayEvent(
		"track-key",
		"session-one",
		"listening-one",
		"browse",
		"nonce-one",
		testPlaybackKeyExpiry,
	); err != nil {
		t.Fatalf("RecordPlayEvent returned error: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet database expectations: %v", err)
	}
}

func TestRecordPlayEventCommitsWithoutInsertForRecentPlay(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	service := &PlaybackService{db: &Database{db: db}}
	mock.ExpectQuery("SELECT id FROM audio_files").
		WithArgs("track-key").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(42))
	mock.ExpectBegin()
	mock.ExpectExec("SELECT pg_advisory_xact_lock").
		WithArgs("42:session-one").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO playback_access_keys").
		WithArgs("nonce-one", testPlaybackKeyExpiry).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectQuery("SELECT COUNT").
		WithArgs(int64(42), "session-one").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
	mock.ExpectCommit()

	if err := service.RecordPlayEvent(
		"track-key",
		"session-one",
		"",
		"browse",
		"nonce-one",
		testPlaybackKeyExpiry,
	); err != nil {
		t.Fatalf("RecordPlayEvent returned error: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet database expectations: %v", err)
	}
}

func TestRecordPlayEventSkipsAClaimedAccessKeyNonce(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	service := &PlaybackService{db: &Database{db: db}}
	mock.ExpectQuery("SELECT id FROM audio_files").
		WithArgs("track-key").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(42))
	mock.ExpectBegin()
	mock.ExpectExec("SELECT pg_advisory_xact_lock").
		WithArgs("42:session-one").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO playback_access_keys").
		WithArgs("nonce-one", testPlaybackKeyExpiry).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectCommit()

	if err := service.RecordPlayEvent(
		"track-key",
		"session-one",
		"",
		"browse",
		"nonce-one",
		testPlaybackKeyExpiry,
	); err != nil {
		t.Fatalf("RecordPlayEvent returned error: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet database expectations: %v", err)
	}
}

func TestCleanupExpiredAccessKeyClaimsBackfillsAndDeletesABatch(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	service := &PlaybackService{
		db:                 &Database{db: db},
		legacyAccessKeyTTL: 30 * time.Minute,
	}
	mock.ExpectBegin()
	mock.ExpectExec("UPDATE playback_access_keys").
		WithArgs(int64((30 * time.Minute).Milliseconds())).
		WillReturnResult(sqlmock.NewResult(0, 2))
	mock.ExpectExec("WITH expired AS").
		WithArgs(int64(playbackClaimCleanupGrace.Milliseconds()), 100).
		WillReturnResult(sqlmock.NewResult(0, 3))
	mock.ExpectCommit()

	deleted, err := service.cleanupExpiredAccessKeyClaims(100)
	if err != nil {
		t.Fatalf("cleanupExpiredAccessKeyClaims returned error: %v", err)
	}
	if deleted != 3 {
		t.Fatalf("deleted = %d, want 3", deleted)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet database expectations: %v", err)
	}
}
