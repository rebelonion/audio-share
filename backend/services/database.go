package services

import (
	"database/sql"
	"log"

	_ "modernc.org/sqlite"
)

type Database struct {
	db   *sql.DB
	path string
}

func NewDatabase(dbPath string) *Database {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}

	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		log.Printf("Warning: could not enable WAL mode: %v", err)
	}

	database := &Database{db: db, path: dbPath}
	database.migrate()

	return database
}

func (d *Database) migrate() {
	schema := `
		CREATE TABLE IF NOT EXISTS folders (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
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
			indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS audio_files (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			path TEXT NOT NULL UNIQUE,
			parent_path TEXT,
			filename TEXT NOT NULL,
			size INTEGER,
			mime_type TEXT,
			modified_at TEXT,
			title TEXT,
			meta_artist TEXT,
			upload_date TEXT,
			webpage_url TEXT,
			description TEXT,
			indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);

		-- Folder indexes
		CREATE INDEX IF NOT EXISTS idx_folders_path ON folders(path);
		CREATE INDEX IF NOT EXISTS idx_folders_parent_path ON folders(parent_path);
		CREATE INDEX IF NOT EXISTS idx_folders_search ON folders(name, folder_name);

		-- Audio file indexes
		CREATE INDEX IF NOT EXISTS idx_audio_files_path ON audio_files(path);
		CREATE INDEX IF NOT EXISTS idx_audio_files_parent_path ON audio_files(parent_path);
		CREATE INDEX IF NOT EXISTS idx_audio_files_search ON audio_files(filename, title, meta_artist, description);

		CREATE TABLE IF NOT EXISTS play_events (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			audio_file_id INTEGER NOT NULL REFERENCES audio_files(id),
			played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_play_events_audio_file_id ON play_events(audio_file_id);
		CREATE INDEX IF NOT EXISTS idx_play_events_played_at ON play_events(played_at);

		CREATE TABLE IF NOT EXISTS source_requests (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			submitted_url TEXT NOT NULL,
			canonical_id TEXT,
			title TEXT NOT NULL,
			image_url TEXT,
			status TEXT NOT NULL DEFAULT 'requested',
			tags TEXT DEFAULT '[]',
			folder_share_key TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_source_requests_status ON source_requests(status);
	`

	if _, err := d.db.Exec(schema); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	alterations := []string{
		"ALTER TABLE audio_files ADD COLUMN downloaded_at TEXT",
		"ALTER TABLE audio_files ADD COLUMN source_path TEXT",
		"ALTER TABLE audio_files ADD COLUMN thumbnail TEXT",
		"ALTER TABLE audio_files ADD COLUMN share_key TEXT",
		"ALTER TABLE audio_files ADD COLUMN deleted INTEGER DEFAULT 0",
		"ALTER TABLE folders ADD COLUMN share_key TEXT",
	}
	for _, stmt := range alterations {
		d.db.Exec(stmt)
	}

	indexes := `
		CREATE INDEX IF NOT EXISTS idx_audio_files_downloaded_at ON audio_files(downloaded_at);
		CREATE INDEX IF NOT EXISTS idx_audio_files_source_path ON audio_files(source_path);
		CREATE UNIQUE INDEX IF NOT EXISTS idx_audio_files_share_key ON audio_files(share_key);
		CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_share_key ON folders(share_key);
	`
	if _, err := d.db.Exec(indexes); err != nil {
		log.Printf("Warning: could not create new indexes: %v", err)
	}
}

func (d *Database) DB() *sql.DB {
	return d.db
}

func (d *Database) Close() error {
	return d.db.Close()
}
