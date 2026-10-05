CREATE TABLE share_submissions (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    submitted_url TEXT,
    source_key TEXT,
    source TEXT NOT NULL DEFAULT 'live' CHECK (source IN ('live', 'rybbit')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX share_submissions_session_idx ON share_submissions(session_id);
CREATE INDEX share_submissions_source_key_idx ON share_submissions(source_key, created_at) WHERE source_key IS NOT NULL;
CREATE UNIQUE INDEX share_submissions_rybbit_idx ON share_submissions(session_id, created_at) WHERE source = 'rybbit';
