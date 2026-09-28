package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"
)

type HealthConfig struct {
	BuildID             string `json:"buildId"`
	IndexSchedule       string `json:"indexSchedule"`
	WaveformSchedule    string `json:"waveformSchedule"`
	ErrorReportsEnabled bool   `json:"errorReportsEnabled"`
}

type LibraryCounts struct {
	Tracks            int64 `json:"tracks"`
	Folders           int64 `json:"folders"`
	Deleted           int64 `json:"deleted"`
	Unavailable       int64 `json:"unavailable"`
	RemovalRequested  int64 `json:"removalRequested"`
	IdentityConflicts int64 `json:"identityConflicts"`
	WaveformReady     int64 `json:"waveformReady"`
	WaveformPending   int64 `json:"waveformPending"`
	AwaitingIndex     int64 `json:"awaitingIndex"`
}

type JobRunStatus struct {
	ID         int64      `json:"id"`
	Job        string     `json:"job"`
	StartedAt  time.Time  `json:"startedAt"`
	FinishedAt *time.Time `json:"finishedAt"`
	State      string     `json:"state"`
	Summary    JobSummary `json:"summary"`
}

type HealthTrack struct {
	ID       int64  `json:"id"`
	ShareKey string `json:"shareKey"`
	Path     string `json:"path"`
	Title    string `json:"title"`
	MediaID  string `json:"mediaId"`
}

type OperationalError struct {
	ID          int64        `json:"id"`
	CreatedAt   time.Time    `json:"createdAt"`
	Origin      string       `json:"origin"`
	Operation   string       `json:"operation"`
	Stage       string       `json:"stage"`
	Cause       string       `json:"cause"`
	Outcome     string       `json:"outcome"`
	FailedItems int          `json:"failedItems"`
	Context     ErrorContext `json:"context"`
}

type LibraryHealth struct {
	GeneratedAt      time.Time            `json:"generatedAt"`
	SchemaVersion    int                  `json:"schemaVersion"`
	Config           HealthConfig         `json:"config"`
	Library          LibraryCounts        `json:"library"`
	Jobs             []JobRunStatus       `json:"jobs"`
	LastSuccess      map[string]time.Time `json:"lastSuccess"`
	PendingWaveforms []HealthTrack        `json:"pendingWaveforms"`
	Conflicts        []HealthTrack        `json:"conflicts"`
	Errors           []OperationalError   `json:"errors"`
}

// A running record is active only while its original session owns the job lock.
const jobRunStateSQL = `CASE WHEN j.state = 'running' AND NOT EXISTS (
    SELECT 1 FROM pg_locks l WHERE l.locktype = 'advisory' AND l.granted AND l.pid = j.backend_pid
    AND l.database = (SELECT oid FROM pg_database WHERE datname = current_database())
    AND l.classid = ((hashtextextended('audio-share/job/' || j.job, 0) >> 32) & 4294967295)::oid
    AND l.objid = (hashtextextended('audio-share/job/' || j.job, 0) & 4294967295)::oid
    AND l.objsubid = 1
) THEN 'interrupted' ELSE j.state END`

func ReadLibraryHealth(ctx context.Context, db *sql.DB) (*LibraryHealth, error) {
	result := &LibraryHealth{GeneratedAt: time.Now().UTC(), SchemaVersion: SchemaVersion,
		Jobs: []JobRunStatus{}, LastSuccess: map[string]time.Time{}, PendingWaveforms: []HealthTrack{}, Conflicts: []HealthTrack{}, Errors: []OperationalError{}}
	err := db.QueryRowContext(ctx, `SELECT
        COUNT(*) FILTER (WHERE af.deleted = 0),
        (SELECT COUNT(*) FROM folders),
        COUNT(*) FILTER (WHERE af.deleted <> 0),
        COUNT(*) FILTER (WHERE af.deleted = 0 AND af.unavailable_at IS NOT NULL),
        COUNT(*) FILTER (WHERE af.deleted = 0 AND af.removal_requested_at IS NOT NULL),
        COUNT(*) FILTER (WHERE af.identity_conflicted),
        COUNT(*) FILTER (WHERE af.deleted = 0 AND wc.id IS NOT NULL),
        COUNT(*) FILTER (WHERE af.deleted = 0 AND wc.id IS NULL AND af.file_mtime_ns IS NOT NULL),
        COUNT(*) FILTER (WHERE af.deleted = 0 AND wc.id IS NULL AND af.file_mtime_ns IS NULL)
        FROM audio_files af LEFT JOIN waveform_cache wc ON wc.audio_file_id = af.id`).Scan(
		&result.Library.Tracks, &result.Library.Folders, &result.Library.Deleted,
		&result.Library.Unavailable, &result.Library.RemovalRequested, &result.Library.IdentityConflicts,
		&result.Library.WaveformReady, &result.Library.WaveformPending, &result.Library.AwaitingIndex)
	if err != nil {
		return nil, err
	}
	if err := readJobRuns(ctx, db, result); err != nil {
		return nil, err
	}
	result.PendingWaveforms, err = readHealthTracks(ctx, db, `af.deleted = 0 AND NOT EXISTS (SELECT 1 FROM waveform_cache wc WHERE wc.audio_file_id = af.id)`)
	if err != nil {
		return nil, err
	}
	result.Conflicts, err = readHealthTracks(ctx, db, `af.identity_conflicted`)
	if err != nil {
		return nil, err
	}
	rows, err := db.QueryContext(ctx, `SELECT id, created_at, origin, operation, stage, cause, outcome, failed_items, context
        FROM error_reports ORDER BY created_at DESC, id DESC LIMIT 30`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var event OperationalError
		var body []byte
		if err := rows.Scan(&event.ID, &event.CreatedAt, &event.Origin, &event.Operation, &event.Stage, &event.Cause, &event.Outcome, &event.FailedItems, &body); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(body, &event.Context); err != nil {
			return nil, err
		}
		event.Context = event.Context.sanitized()
		result.Errors = append(result.Errors, event)
	}
	return result, rows.Err()
}

func readJobRuns(ctx context.Context, db *sql.DB, result *LibraryHealth) error {
	rows, err := db.QueryContext(ctx, `SELECT j.id, j.job, j.started_at, j.finished_at, `+jobRunStateSQL+`, j.summary
        FROM job_runs j ORDER BY j.started_at DESC, j.id DESC LIMIT 30`)
	if err != nil {
		return err
	}
	for rows.Next() {
		var run JobRunStatus
		var body []byte
		if err := rows.Scan(&run.ID, &run.Job, &run.StartedAt, &run.FinishedAt, &run.State, &body); err != nil {
			rows.Close()
			return err
		}
		if err := json.Unmarshal(body, &run.Summary); err != nil {
			rows.Close()
			return err
		}
		run.Summary.Details = run.Summary.Details.sanitized()
		result.Jobs = append(result.Jobs, run)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	rows, err = db.QueryContext(ctx, `SELECT job, MAX(finished_at) FROM job_runs WHERE state = 'succeeded' GROUP BY job`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var job string
		var at time.Time
		if err := rows.Scan(&job, &at); err != nil {
			return err
		}
		result.LastSuccess[job] = at
	}
	return rows.Err()
}

func readHealthTracks(ctx context.Context, db *sql.DB, where string) ([]HealthTrack, error) {
	rows, err := db.QueryContext(ctx, `SELECT af.id, COALESCE(af.share_key,''), af.path, COALESCE(NULLIF(af.title,''),af.filename), COALESCE(af.media_id,'')
        FROM audio_files af WHERE `+where+` ORDER BY af.indexed_at DESC, af.id DESC LIMIT 20`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	tracks := []HealthTrack{}
	for rows.Next() {
		var track HealthTrack
		if err := rows.Scan(&track.ID, &track.ShareKey, &track.Path, &track.Title, &track.MediaID); err != nil {
			return nil, err
		}
		tracks = append(tracks, track)
	}
	return tracks, rows.Err()
}
