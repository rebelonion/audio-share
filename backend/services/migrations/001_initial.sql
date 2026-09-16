CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE folders (
    id BIGSERIAL PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    parent_path TEXT,
    folder_name TEXT NOT NULL,
    name TEXT NOT NULL,
    original_url TEXT,
    url_broken INTEGER DEFAULT 0,
    item_count INTEGER DEFAULT 0,
    poster_image TEXT,
    indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    share_key TEXT,
    directory_size_bytes BIGINT NOT NULL DEFAULT 0,
    upload_date TEXT
);

CREATE TABLE audio_files (
    id BIGSERIAL PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    parent_path TEXT,
    filename TEXT NOT NULL,
    size BIGINT,
    mime_type TEXT,
    title TEXT,
    meta_artist TEXT,
    upload_date TEXT,
    webpage_url TEXT,
    description TEXT,
    indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    downloaded_at TEXT,
    source_path TEXT,
    thumbnail TEXT,
    age_limit INTEGER,
    share_key TEXT,
    deleted INTEGER DEFAULT 0,
    unavailable_at TIMESTAMPTZ,
    removal_requested_at TIMESTAMPTZ
);

CREATE TABLE play_events (
    id BIGSERIAL PRIMARY KEY,
    audio_file_id BIGINT NOT NULL REFERENCES audio_files(id),
    played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    session_id TEXT,
    listening_session_id TEXT,
    origin TEXT NOT NULL DEFAULT 'legacy',
    access_key_nonce TEXT
);

CREATE TABLE download_events (
    id BIGSERIAL PRIMARY KEY,
    audio_file_id BIGINT NOT NULL REFERENCES audio_files(id),
    downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    event_type TEXT NOT NULL DEFAULT 'download',
    share_key TEXT,
    session_id TEXT,
    client_ip TEXT,
    user_agent TEXT,
    referer TEXT,
    range_header TEXT,
    method TEXT,
    file_size BIGINT,
    requested_bytes BIGINT,
    access_key_nonce TEXT
);

CREATE TABLE source_requests (
    id BIGSERIAL PRIMARY KEY,
    submitted_url TEXT NOT NULL,
    source_key TEXT,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'requested',
    tags TEXT DEFAULT '[]',
    folder_share_key TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE waveform_cache (
    id BIGSERIAL PRIMARY KEY,
    audio_file_id BIGINT NOT NULL UNIQUE REFERENCES audio_files(id),
    peaks TEXT NOT NULL,
    generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    duration_seconds REAL
);

CREATE TABLE anonymous_profiles (
    session_id TEXT PRIMARY KEY,
    recovery_key_hash BYTEA UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE targeted_messages (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE likes (
    profile_id TEXT NOT NULL REFERENCES anonymous_profiles(session_id) ON DELETE CASCADE,
    audio_file_id BIGINT NOT NULL REFERENCES audio_files(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (profile_id, audio_file_id)
);

CREATE TABLE playback_access_keys (
    access_key_nonce TEXT PRIMARY KEY,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_folders_parent_path ON folders(parent_path);

CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_share_key ON folders(share_key);

CREATE INDEX IF NOT EXISTS idx_audio_files_parent_path ON audio_files(parent_path);

CREATE INDEX IF NOT EXISTS idx_audio_files_downloaded_at ON audio_files(downloaded_at);

CREATE INDEX IF NOT EXISTS idx_audio_files_source_path ON audio_files(source_path);

CREATE UNIQUE INDEX IF NOT EXISTS idx_audio_files_share_key ON audio_files(share_key);

CREATE INDEX IF NOT EXISTS idx_play_events_audio_file_id ON play_events(audio_file_id);

CREATE INDEX IF NOT EXISTS idx_play_events_played_at ON play_events(played_at);

CREATE INDEX IF NOT EXISTS idx_play_events_session_id ON play_events(session_id);

CREATE INDEX IF NOT EXISTS idx_play_events_listening_session_id ON play_events(listening_session_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_play_events_access_key_nonce ON play_events(access_key_nonce) WHERE access_key_nonce IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_playback_access_keys_expires_at ON playback_access_keys(expires_at) WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_download_events_audio_file_id ON download_events(audio_file_id);

CREATE INDEX IF NOT EXISTS idx_download_events_downloaded_at ON download_events(downloaded_at);

CREATE INDEX IF NOT EXISTS idx_download_events_event_type ON download_events(event_type);

CREATE INDEX IF NOT EXISTS idx_download_events_client_ip ON download_events(client_ip);

CREATE INDEX IF NOT EXISTS idx_download_events_session_id ON download_events(session_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_download_events_access_key_nonce ON download_events(access_key_nonce) WHERE access_key_nonce IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_source_requests_status ON source_requests(status);

CREATE INDEX IF NOT EXISTS idx_likes_audio_file_id ON likes(audio_file_id);

CREATE INDEX IF NOT EXISTS idx_likes_profile_created_at ON likes(profile_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_targeted_messages_session_id ON targeted_messages(session_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_source_requests_submitted_url ON source_requests(submitted_url);

CREATE UNIQUE INDEX IF NOT EXISTS idx_source_requests_source_key ON source_requests(source_key) WHERE source_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audio_files_unavailable_at ON audio_files(unavailable_at) WHERE unavailable_at IS NOT NULL AND deleted = 0;

CREATE INDEX IF NOT EXISTS idx_audio_files_removal_requested_at ON audio_files(removal_requested_at) WHERE removal_requested_at IS NOT NULL AND deleted = 0;

CREATE INDEX IF NOT EXISTS idx_audio_files_trgm_filename ON audio_files USING gin (filename gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_audio_files_trgm_title ON audio_files USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_audio_files_trgm_artist ON audio_files USING gin (meta_artist gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_audio_files_trgm_description ON audio_files USING gin (description gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_folders_trgm_name ON folders USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_folders_trgm_folder_name ON folders USING gin (folder_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_audio_files_upload_date ON audio_files(upload_date);
