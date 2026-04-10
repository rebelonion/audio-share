package services

import (
	"database/sql"
	"log"

	_ "github.com/jackc/pgx/v5/stdlib"
)

type Database struct {
	db *sql.DB
}

func NewDatabase(dsn string) *Database {
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	database := &Database{db: db}
	database.migrate()

	return database
}

func (d *Database) migrate() {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS folders (
			id BIGSERIAL PRIMARY KEY,
			path TEXT NOT NULL UNIQUE,
			parent_path TEXT,
			folder_name TEXT NOT NULL,
			name TEXT NOT NULL,
			original_url TEXT,
			url_broken INTEGER DEFAULT 0,
			item_count INTEGER,
			directory_size TEXT,
			poster_image TEXT,
			modified_at TEXT,
			indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			share_key TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS audio_files (
			id BIGSERIAL PRIMARY KEY,
			path TEXT NOT NULL UNIQUE,
			parent_path TEXT,
			filename TEXT NOT NULL,
			size BIGINT,
			mime_type TEXT,
			modified_at TEXT,
			title TEXT,
			meta_artist TEXT,
			upload_date TEXT,
			webpage_url TEXT,
			description TEXT,
			indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			downloaded_at TEXT,
			source_path TEXT,
			thumbnail TEXT,
			share_key TEXT,
			deleted INTEGER DEFAULT 0
		)`,
		`CREATE TABLE IF NOT EXISTS play_events (
			id BIGSERIAL PRIMARY KEY,
			audio_file_id BIGINT NOT NULL REFERENCES audio_files(id),
			played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS source_requests (
			id BIGSERIAL PRIMARY KEY,
			submitted_url TEXT NOT NULL,
			title TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'requested',
			tags TEXT DEFAULT '[]',
			folder_share_key TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS waveform_cache (
			id BIGSERIAL PRIMARY KEY,
			audio_file_id BIGINT NOT NULL UNIQUE REFERENCES audio_files(id),
			peaks TEXT NOT NULL,
			generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_folders_path ON folders(path)`,
		`CREATE INDEX IF NOT EXISTS idx_folders_parent_path ON folders(parent_path)`,
		`CREATE INDEX IF NOT EXISTS idx_folders_search ON folders(name, folder_name)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_share_key ON folders(share_key)`,
		`CREATE INDEX IF NOT EXISTS idx_audio_files_path ON audio_files(path)`,
		`CREATE INDEX IF NOT EXISTS idx_audio_files_parent_path ON audio_files(parent_path)`,
		`CREATE INDEX IF NOT EXISTS idx_audio_files_search ON audio_files(filename, title, meta_artist)`,
		`CREATE INDEX IF NOT EXISTS idx_audio_files_downloaded_at ON audio_files(downloaded_at)`,
		`CREATE INDEX IF NOT EXISTS idx_audio_files_source_path ON audio_files(source_path)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_audio_files_share_key ON audio_files(share_key)`,
		`ALTER TABLE play_events ADD COLUMN IF NOT EXISTS session_id TEXT`,
		`CREATE INDEX IF NOT EXISTS idx_play_events_audio_file_id ON play_events(audio_file_id)`,
		`CREATE INDEX IF NOT EXISTS idx_play_events_played_at ON play_events(played_at)`,
		`CREATE INDEX IF NOT EXISTS idx_play_events_session_id ON play_events(session_id)`,
		`CREATE INDEX IF NOT EXISTS idx_source_requests_status ON source_requests(status)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_source_requests_submitted_url ON source_requests(submitted_url)`,
		`ALTER TABLE audio_files ADD COLUMN IF NOT EXISTS unavailable_at TIMESTAMPTZ`,
		`ALTER TABLE waveform_cache ADD COLUMN IF NOT EXISTS duration_seconds REAL`,
	}

	for _, stmt := range statements {
		if _, err := d.db.Exec(stmt); err != nil {
			log.Fatalf("Failed migration: %v\n%s", err, stmt)
		}
	}
}

func (d *Database) DB() *sql.DB {
	return d.db
}

func (d *Database) Close() error {
	return d.db.Close()
}
