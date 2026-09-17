package services

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
)

// Tests own only their temporary schema; they never reset the supplied database.
func integrationDatabase(t *testing.T) *Database {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL for PostgreSQL integration tests")
	}
	admin, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { admin.Close() })
	schema := fmt.Sprintf("audio_share_test_%d", time.Now().UnixNano())
	quoted := pgx.Identifier{schema}.Sanitize()
	if _, err := admin.Exec("CREATE SCHEMA " + quoted); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := admin.Exec("DROP SCHEMA " + quoted + " CASCADE"); err != nil {
			t.Error(err)
		}
	})
	config, err := pgx.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	config.RuntimeParams["search_path"] = schema + ",public"
	db := &Database{db: stdlib.OpenDB(*config)}
	t.Cleanup(func() { db.Close() })
	return db
}

func TestIntegrationMigrationsFreshConcurrentAndCompatible(t *testing.T) {
	db := integrationDatabase(t)
	ctx := context.Background()
	if err := db.CheckSchema(ctx); err == nil {
		t.Fatal("uninitialized schema accepted")
	}
	var wg sync.WaitGroup
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := db.Migrate(ctx); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if err := db.CheckSchema(ctx); err != nil {
		t.Fatal(err)
	}
	var count int
	db.db.QueryRow(`SELECT count(*) FROM schema_migrations`).Scan(&count)
	if count != SchemaVersion {
		t.Fatalf("ledger count %d", count)
	}
	if _, err := db.db.Exec(`INSERT INTO schema_migrations(version,min_app_version,checksum) VALUES($1,1,'future')`, SchemaVersion+1); err != nil {
		t.Fatal(err)
	}
	if err := db.CheckSchema(ctx); err != nil {
		t.Fatalf("additive future migration broke overlap: %v", err)
	}
	db.db.Exec(`UPDATE schema_migrations SET min_app_version = $1 WHERE version = $1`, SchemaVersion+1)
	if err := db.CheckSchema(ctx); err == nil {
		t.Fatal("breaking future schema accepted")
	}
}

func TestIntegrationBaselineDoesNotReplayLegacyChanges(t *testing.T) {
	db := integrationDatabase(t)
	if _, err := db.db.Exec(initialSchema); err != nil {
		t.Fatal(err)
	}
	if _, err := db.db.Exec(`ALTER TABLE folders ADD COLUMN directory_size TEXT;
		INSERT INTO folders(path,folder_name,name,directory_size) VALUES('baseline-fixture','fixture','Fixture','keep me')`); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if err := db.Migrate(context.Background()); err != nil {
			t.Fatal(err)
		}
	}
	var value string
	if err := db.db.QueryRow(`SELECT directory_size FROM folders WHERE path='baseline-fixture'`).Scan(&value); err != nil {
		t.Fatal(err)
	}
	if value != "keep me" {
		t.Fatal(value)
	}
}

func TestIntegrationIncompleteBaselineRollsBack(t *testing.T) {
	db := integrationDatabase(t)
	if _, err := db.db.Exec(initialSchema); err != nil {
		t.Fatal(err)
	}
	db.db.Exec(`ALTER TABLE audio_files DROP COLUMN age_limit`)
	if err := db.Migrate(context.Background()); err == nil {
		t.Fatal("accepted incomplete legacy schema")
	}
	var ledger *string
	if err := db.db.QueryRow(`SELECT to_regclass(current_schema() || '.schema_migrations')::text`).Scan(&ledger); err != nil {
		t.Fatal(err)
	}
	if ledger != nil {
		t.Fatal("failed baseline left a ledger")
	}
}

func TestIntegrationJobLockCoordinatesConnections(t *testing.T) {
	db := integrationDatabase(t)
	entered, release := make(chan struct{}), make(chan struct{})
	done := make(chan error, 1)
	go func() {
		done <- withJobLock(db.db, "test-job", func(*sql.Conn) error { close(entered); <-release; return nil })
	}()
	select {
	case <-entered:
	case <-time.After(5 * time.Second):
		t.Fatal("lock not acquired")
	}
	runs := 0
	err := withJobLock(db.db, "test-job", func(*sql.Conn) error { runs++; return nil })
	close(release)
	if err != nil {
		t.Fatal(err)
	}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	if runs != 0 {
		t.Fatal("overlapping job ran")
	}
	if err := withJobLock(db.db, "test-job", func(*sql.Conn) error { runs++; return nil }); err != nil {
		t.Fatal(err)
	}
	if runs != 1 {
		t.Fatal("released lock not reusable")
	}
}

func TestIntegrationConfiguredDatabaseBaselineReadOnly(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL")
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	tx, err := db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if err := validateBaseline(ctx, tx); err != nil {
		t.Fatal(err)
	}
}
