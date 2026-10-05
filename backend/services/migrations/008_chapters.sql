-- NULL means no successful chapter probe yet; '[]' means probed with no chapters.
ALTER TABLE waveform_cache ADD COLUMN chapters JSONB;
-- When the last probe ran, so failed probes are retried with backoff rather than every run.
ALTER TABLE waveform_cache ADD COLUMN chapters_probed_at TIMESTAMPTZ;
