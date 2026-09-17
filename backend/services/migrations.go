package services

import (
	"context"
	"crypto/sha256"
	"database/sql"
	_ "embed"
	"fmt"
)

//go:embed migrations/001_initial.sql
var initialSchema string

//go:embed migrations/002_error_reporting.sql
var errorReportingSchema string

//go:embed migrations/003_webpage_url_search.sql
var webpageURLSearchSchema string

//go:embed migrations/004_error_context.sql
var errorContextSchema string

const SchemaVersion = 4

type schemaMigration struct {
	version       int
	minAppVersion int
	sql           string
}

var schemaMigrations = []schemaMigration{
	{1, 1, initialSchema},
	{2, 1, errorReportingSchema},
	{3, 1, webpageURLSearchSchema},
	{4, 1, errorContextSchema},
}

// Migrate adopts the current legacy schema or creates a fresh one. All changes,
// including the ledger, commit together; a failed baseline leaves no ledger.
func (d *Database) Migrate(ctx context.Context) error {
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, stmt := range []string{
		`SET LOCAL lock_timeout = '3s'`,
		`SET LOCAL statement_timeout = '60s'`,
		`SELECT pg_advisory_xact_lock(617532001)`,
		`CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			min_app_version INTEGER NOT NULL,
			checksum TEXT NOT NULL,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
	} {
		if _, err := tx.ExecContext(ctx, stmt); err != nil {
			return fmt.Errorf("prepare migrations: %w", err)
		}
	}
	for _, migration := range schemaMigrations {
		checksum := fmt.Sprintf("%x", sha256.Sum256([]byte(migration.sql)))
		var existing string
		err := tx.QueryRowContext(ctx, `SELECT checksum FROM schema_migrations WHERE version = $1`, migration.version).Scan(&existing)
		if err == nil {
			if existing != checksum {
				return fmt.Errorf("migration %d checksum differs; applied migrations must not be edited", migration.version)
			}
			continue
		}
		if err != sql.ErrNoRows {
			return err
		}
		if migration.version == 1 {
			if err := applyBaseline(ctx, tx); err != nil {
				return err
			}
		} else if _, err := tx.ExecContext(ctx, migration.sql); err != nil {
			return fmt.Errorf("migration %d: %w", migration.version, err)
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations (version, min_app_version, checksum) VALUES ($1, $2, $3)`, migration.version, migration.minAppVersion, checksum); err != nil {
			return err
		}
	}
	if err := checkSchema(ctx, tx); err != nil {
		return err
	}
	return tx.Commit()
}

func applyBaseline(ctx context.Context, tx *sql.Tx) error {
	var tables int
	if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_name <> 'schema_migrations' AND table_type = 'BASE TABLE'`).Scan(&tables); err != nil {
		return err
	}
	if tables == 0 {
		if _, err := tx.ExecContext(ctx, initialSchema); err != nil {
			return fmt.Errorf("create initial schema: %w", err)
		}
		return nil
	}
	if err := validateBaseline(ctx, tx); err != nil {
		return fmt.Errorf("cannot baseline existing database; bring it to the preceding release's schema first: %w", err)
	}
	return nil
}

func validateBaseline(ctx context.Context, tx *sql.Tx) error {
	for table, columns := range baselineColumns {
		rows, err := tx.QueryContext(ctx, `SELECT column_name, data_type FROM information_schema.columns
			WHERE table_schema = current_schema() AND table_name = $1`, table)
		if err != nil {
			return fmt.Errorf("table %s: %w", table, err)
		}
		actual := make(map[string]string)
		for rows.Next() {
			var name, kind string
			if err := rows.Scan(&name, &kind); err != nil {
				rows.Close()
				return err
			}
			actual[name] = kind
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return err
		}
		rows.Close()
		for name, kind := range columns {
			if actual[name] != kind {
				return fmt.Errorf("%s.%s: expected %s, found %q", table, name, kind, actual[name])
			}
		}
	}
	for _, name := range baselineIndexes {
		var valid bool
		if err := tx.QueryRowContext(ctx, `SELECT EXISTS (
			SELECT 1 FROM pg_index WHERE indexrelid = to_regclass(quote_ident(current_schema()) || '.' || quote_ident($1)) AND indisvalid
		)`, name).Scan(&valid); err != nil {
			return err
		}
		if !valid {
			return fmt.Errorf("required index %s is missing or invalid", name)
		}
	}
	return nil
}

type schemaQuerier interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func checkSchema(ctx context.Context, db schemaQuerier) error {
	var exists bool
	if err := db.QueryRowContext(ctx, `SELECT to_regclass(quote_ident(current_schema()) || '.schema_migrations') IS NOT NULL`).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return fmt.Errorf("schema is not versioned; run the migrate command")
	}
	var version, minApp int
	if err := db.QueryRowContext(ctx, `SELECT COALESCE(MAX(version), 0), COALESCE(MAX(min_app_version), 0) FROM schema_migrations`).Scan(&version, &minApp); err != nil {
		return fmt.Errorf("schema unavailable; run the migrate command: %w", err)
	}
	// Future additive migrations retain min_app_version so old instances can drain.
	if version < SchemaVersion || minApp > SchemaVersion {
		return fmt.Errorf("incompatible schema: database version %d requires app schema %d; this app supports %d", version, minApp, SchemaVersion)
	}
	return nil
}

func (d *Database) CheckSchema(ctx context.Context) error { return checkSchema(ctx, d.db) }
