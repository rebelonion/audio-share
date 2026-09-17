CREATE TABLE error_reports (
    id BIGSERIAL PRIMARY KEY,
    event_id TEXT UNIQUE,
    fingerprint TEXT NOT NULL,
    origin TEXT NOT NULL,
    operation TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT '',
    stage TEXT NOT NULL,
    cause TEXT NOT NULL,
    code TEXT NOT NULL DEFAULT '',
    outcome TEXT NOT NULL,
    source_hash TEXT NOT NULL DEFAULT '',
    build_id TEXT NOT NULL DEFAULT '',
    browser TEXT NOT NULL DEFAULT '',
    status INTEGER NOT NULL DEFAULT 0,
    failed_items INTEGER NOT NULL DEFAULT 0,
    attempted_items INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX error_reports_created_idx ON error_reports(created_at);
CREATE INDEX error_reports_group_idx ON error_reports(fingerprint, created_at);

CREATE TABLE error_alerts (
    fingerprint TEXT PRIMARY KEY,
    notified_at TIMESTAMPTZ,
    pending_body TEXT,
    pending_through TIMESTAMPTZ,
    covered_through TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
