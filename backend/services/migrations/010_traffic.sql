-- Response bytes and request counts per traffic kind. Minute buckets feed
-- recent windows and are pruned; hour buckets are retained for long-range
-- history; running totals give all-time figures and when counting began.
CREATE TABLE traffic_minutes (
    minute TIMESTAMPTZ NOT NULL,
    kind TEXT NOT NULL,
    bytes BIGINT NOT NULL DEFAULT 0,
    requests BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (minute, kind)
);
CREATE TABLE traffic_hours (
    hour TIMESTAMPTZ NOT NULL,
    kind TEXT NOT NULL,
    bytes BIGINT NOT NULL DEFAULT 0,
    requests BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (hour, kind)
);
CREATE TABLE traffic_totals (
    kind TEXT PRIMARY KEY,
    bytes BIGINT NOT NULL DEFAULT 0,
    requests BIGINT NOT NULL DEFAULT 0,
    first_minute TIMESTAMPTZ NOT NULL
);
-- IDs of saved batches; a retried batch whose ID is present was already counted.
CREATE TABLE traffic_batches (
    id TEXT PRIMARY KEY,
    saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
