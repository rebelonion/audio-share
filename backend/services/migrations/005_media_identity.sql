ALTER TABLE audio_files ADD COLUMN media_id TEXT;
ALTER TABLE audio_files ADD COLUMN file_mtime_ns BIGINT;
ALTER TABLE audio_files ADD COLUMN media_revision BIGINT NOT NULL DEFAULT 0;
CREATE INDEX idx_audio_files_parent_media_id ON audio_files (parent_path, media_id);

CREATE TABLE media_recovery_attempts (
    parent_path TEXT PRIMARY KEY,
    attempted_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE audio_files ADD COLUMN identity_conflicted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE audio_files ADD CONSTRAINT audio_files_conflict_requires_deleted
    CHECK (NOT identity_conflicted OR deleted = 1);
ALTER TABLE audio_files DROP CONSTRAINT audio_files_path_key;
ALTER TABLE audio_files ADD COLUMN active_path TEXT GENERATED ALWAYS AS
    (CASE WHEN deleted = 0 THEN path ELSE NULL END) STORED;
ALTER TABLE audio_files ADD CONSTRAINT audio_files_active_path_key
    UNIQUE (active_path) DEFERRABLE INITIALLY IMMEDIATE;
