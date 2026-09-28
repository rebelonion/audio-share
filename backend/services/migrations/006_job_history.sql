CREATE TABLE job_runs (
    id BIGSERIAL PRIMARY KEY,
    job TEXT NOT NULL CHECK (job IN ('reindex', 'waveform')),
    backend_pid INTEGER NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    finished_at TIMESTAMPTZ,
    state TEXT NOT NULL DEFAULT 'running' CHECK (state IN ('running', 'succeeded', 'degraded', 'failed', 'interrupted')),
    summary JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX job_runs_job_started_idx ON job_runs(job, started_at DESC);
