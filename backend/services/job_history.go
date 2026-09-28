package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"time"
)

type JobSummary struct {
	Attempted       int64        `json:"attempted"`
	Processed       int64        `json:"processed"`
	Issues          int64        `json:"issues"`
	Folders         int          `json:"folders"`
	DeferredFolders int          `json:"deferredFolders"`
	Details         ErrorContext `json:"details"`
}

type jobRun struct {
	id   int64
	conn *sql.Conn
}

// History is best-effort and always uses the job's locked connection.
func beginJobRun(conn *sql.Conn, job string) *jobRun {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := conn.ExecContext(ctx, `UPDATE job_runs SET state = 'interrupted'
        WHERE job = $1 AND state = 'running'`, job); err != nil {
		log.Printf("Job history: %s", DiagnosticText(err.Error(), 1000))
		return nil
	}
	run := &jobRun{conn: conn}
	if err := conn.QueryRowContext(ctx, `INSERT INTO job_runs(job, backend_pid) VALUES ($1, pg_backend_pid()) RETURNING id`, job).Scan(&run.id); err != nil {
		log.Printf("Job history: %s", DiagnosticText(err.Error(), 1000))
		return nil
	}
	return run
}

func (r *jobRun) finish(summary JobSummary, runErr error) {
	if r == nil {
		return
	}
	state := "succeeded"
	if summary.Issues > 0 || summary.DeferredFolders > 0 {
		state = "degraded"
	}
	if runErr != nil {
		state = "failed"
		summary.Details.Message = runErr.Error()
	}
	summary.Details = summary.Details.sanitized()
	body, err := json.Marshal(summary)
	if err != nil {
		log.Printf("Job history encoding: %v", err)
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := r.conn.ExecContext(ctx, `UPDATE job_runs SET finished_at = clock_timestamp(), state = $2, summary = $3 WHERE id = $1`, r.id, state, string(body)); err != nil {
		log.Printf("Job history: %s", DiagnosticText(err.Error(), 1000))
		return
	}
	if _, err := r.conn.ExecContext(ctx, `DELETE FROM job_runs WHERE id IN
        (SELECT id FROM job_runs WHERE state <> 'running' ORDER BY id DESC OFFSET 1000)`); err != nil {
		log.Printf("Job history retention: %s", DiagnosticText(err.Error(), 1000))
	}
}
