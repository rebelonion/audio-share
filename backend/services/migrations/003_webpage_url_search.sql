CREATE INDEX IF NOT EXISTS idx_audio_files_trgm_webpage_url
    ON audio_files USING gin (webpage_url gin_trgm_ops);
