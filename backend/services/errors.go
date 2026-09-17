package services

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

// Context accompanies each report but does not affect alert grouping.
type ErrorEvent struct {
	EventID        string       `json:"eventId"`
	Operation      string       `json:"operation"`
	Method         string       `json:"method"`
	Stage          string       `json:"stage"`
	Cause          string       `json:"cause"`
	Code           string       `json:"code"`
	Outcome        string       `json:"outcome"`
	BuildID        string       `json:"buildId"`
	Browser        string       `json:"browser"`
	Status         int          `json:"status"`
	FailedItems    int          `json:"-"`
	AttemptedItems int          `json:"-"`
	Context        ErrorContext `json:"context,omitempty"`
}

func member(value, options string) bool {
	return strings.Contains("|"+options+"|", "|"+value+"|") && value != "" && !strings.Contains(value, "|")
}

func (e ErrorEvent) Valid() bool {
	return member(e.Operation, "captcha|session|media-access|playback|download|browse|search|recommendations|recent|popular|new-tracks|unavailable-tracks|stats|requests|likes|profile|recovery|preferences|contact|source-request|targeted-message|metadata|waveform|artwork|page|version|playback-record|admin|reindex|playback-cleanup|index-webhook") &&
		member(e.Stage, "request|response|setup|solve|verify|play|read|render|import|run|normalize|deliver|store|parse") &&
		member(e.Cause, "network|timeout|unavailable|invalid-response|unexpected|media-network|media-decode|media-source|missing-file|io|partial-failure|invalid-data|panic|cloudflare") &&
		member(e.Outcome, "blocked|degraded") && (e.Method == "" || member(e.Method, "GET|HEAD|POST|PUT|PATCH|DELETE")) && e.Status >= 0 && e.Status <= 599
}

func SafeErrorCode(code string) string {
	if member(code, "Error|TypeError|RangeError|ReferenceError|SyntaxError|URIError|EvalError|TimeoutError|NotSupportedError|missing_endpoint|network_error|challenge_parse_error|challenge_unsupported|solve_failed|instr_timeout|instr_blocked|redeem_failed|invalid_solution|invalid_expires|wasm_load_failed|worker_spawn_failed|db_numeric_out_of_range|db_timeout|db_connection_failed|db_query_canceled|db_query_failed") {
		return code
	}
	return "unknown"
}

// DatabaseErrorCode classifies wrapped database errors without exposing messages or SQL.
func DatabaseErrorCode(err error) string {
	var netErr net.Error
	if errors.Is(err, context.DeadlineExceeded) || pgconn.Timeout(err) || (errors.As(err, &netErr) && netErr.Timeout()) {
		return "db_timeout"
	}
	if errors.Is(err, context.Canceled) {
		return "db_query_canceled"
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "22003":
			return "db_numeric_out_of_range"
		case "57014":
			// PostgreSQL uses the same SQLSTATE for statement timeouts and other cancellations.
			return "db_query_canceled"
		case "57P01", "57P02", "57P03", "53300":
			return "db_connection_failed"
		}
		if strings.HasPrefix(pgErr.Code, "08") {
			return "db_connection_failed"
		}
		return "db_query_failed"
	}
	var connectErr *pgconn.ConnectError
	if errors.As(err, &netErr) || errors.As(err, &connectErr) || errors.Is(err, driver.ErrBadConn) || errors.Is(err, sql.ErrConnDone) {
		return "db_connection_failed"
	}
	return "unknown"
}

func (e ErrorEvent) fingerprint(origin string) string {
	return strings.Join([]string{origin, e.Operation, e.Method, e.Stage, e.Cause, SafeErrorCode(e.Code), e.Outcome}, "/")
}

var diagnosticLabel = regexp.MustCompile(`^[a-zA-Z0-9._-]{1,100}$`)

func SafeDiagnosticLabel(value string) string {
	if diagnosticLabel.MatchString(value) {
		return value
	}
	return "unknown"
}

type ErrorPolicy struct {
	Window, Cooldown, Retention                                        time.Duration
	BrowserCount, BrowserSources, ServerCount, MutationCount, JobCount int
}

func (p ErrorPolicy) Validate() error {
	if p.Window <= 0 || p.Cooldown <= 0 || p.Retention < p.Window || p.Retention < p.Cooldown ||
		p.BrowserCount < 1 || p.BrowserSources < 1 || p.ServerCount < 1 || p.MutationCount < 1 || p.JobCount < 1 {
		return fmt.Errorf("invalid error reporting policy: durations and thresholds must be positive and retention must cover window/cooldown")
	}
	return nil
}

type ErrorReporter struct {
	db     *sql.DB
	build  string
	policy ErrorPolicy
	ntfy   *NtfyService
}

func NewErrorReporter(db *sql.DB, build string, policy ErrorPolicy, ntfy *NtfyService) *ErrorReporter {
	return &ErrorReporter{db: db, build: SafeDiagnosticLabel(build), policy: policy, ntfy: ntfy}
}

func (r *ErrorReporter) Record(ctx context.Context, origin, sourceHash string, e ErrorEvent) error {
	if r == nil {
		return nil
	}
	if !e.Valid() || !member(origin, "browser|server|worker") {
		return fmt.Errorf("invalid error report")
	}
	if origin != "browser" {
		e.BuildID = r.build
	}
	if e.EventID == "" {
		e.EventID = NewDiagnosticID()
	}
	e.Context = e.Context.sanitized()
	if e.Context.Message == "" && e.Context.Route == "" && len(e.Context.Failures) == 0 {
		e.Context.Message = "Legacy report without diagnostics; update the reporting caller"
	}
	details, err := json.Marshal(e.Context)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, time.Second)
	defer cancel()
	_, err = r.db.ExecContext(ctx, `INSERT INTO error_reports
		(event_id,fingerprint,origin,operation,stage,cause,outcome,source_hash,build_id,browser,status,failed_items,attempted_items,method,code,context)
		VALUES(NULLIF($1,''),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT(event_id) DO NOTHING`,
		e.EventID, e.fingerprint(origin), origin, e.Operation, e.Stage, e.Cause, e.Outcome, sourceHash,
		SafeDiagnosticLabel(e.BuildID), e.Browser, e.Status, e.FailedItems, e.AttemptedItems, e.Method, SafeErrorCode(e.Code), string(details))
	if err == nil {
		log.Printf("Error event id=%s operation=%s origin=%s context=%s", e.EventID, e.Operation, origin, details)
	}
	return err
}

func (r *ErrorReporter) Report(origin string, e ErrorEvent) {
	if err := r.Record(context.Background(), origin, "", e); err != nil {
		// Never feed collector failures back into the collector.
		log.Printf("Error reporting unavailable: %v", err)
	}
}

func (p ErrorPolicy) exceeded(origin, operation, method string, count, sources int) bool {
	if origin == "worker" {
		return count >= p.JobCount
	}
	mutation := member(method, "POST|PUT|PATCH|DELETE") || member(operation, "contact|source-request|recovery")
	threshold := p.ServerCount
	if origin == "browser" {
		threshold = p.BrowserCount
	}
	if mutation && member(operation, "likes|profile|recovery|preferences|contact|source-request") {
		threshold = p.MutationCount
	}
	return count >= threshold && (origin != "browser" || sources >= min(p.BrowserSources, threshold))
}

// Process persists notification bodies before delivery. A failed delivery remains
// pending after the counting window expires and across worker restarts.
func (r *ErrorReporter) Process() error {
	if r == nil {
		return nil
	}
	return withJobLock(r.db, "error-alerts", func(conn *sql.Conn) error {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		rows, err := conn.QueryContext(ctx, `SELECT e.fingerprint, e.origin, e.operation, e.method, e.stage, e.cause, e.code, e.outcome,
			COUNT(*), COUNT(DISTINCT NULLIF(e.source_hash,'')), MAX(e.created_at),
			string_agg(DISTINCT e.build_id, ', '), string_agg(DISTINCT NULLIF(e.browser,''), ', '),
			string_agg(DISTINCT NULLIF(e.status,0)::text, ', '),
			COALESCE(SUM(e.failed_items),0), COALESCE(SUM(e.attempted_items),0)
			FROM error_reports e LEFT JOIN error_alerts a ON a.fingerprint=e.fingerprint
			WHERE e.created_at > clock_timestamp()-($1 * interval '1 second')
			AND (a.covered_through IS NULL OR e.created_at > a.covered_through)
			AND a.pending_body IS NULL
			AND (a.notified_at IS NULL OR a.notified_at < clock_timestamp()-($2 * interval '1 second'))
			GROUP BY e.fingerprint,e.origin,e.operation,e.method,e.stage,e.cause,e.code,e.outcome
			ORDER BY COUNT(*) DESC`, r.policy.Window.Seconds(), r.policy.Cooldown.Seconds())
		if err != nil {
			return err
		}
		type candidate struct {
			key, body string
			through   time.Time
		}
		var candidates []candidate
		for rows.Next() {
			var key, origin, operation, method, stage, cause, code, outcome, builds string
			var browsers, statuses sql.NullString
			var count, sources, failed, attempted int
			var through time.Time
			if err := rows.Scan(&key, &origin, &operation, &method, &stage, &cause, &code, &outcome, &count, &sources, &through, &builds, &browsers, &statuses, &failed, &attempted); err != nil {
				rows.Close()
				return err
			}
			if !r.policy.exceeded(origin, operation, method, count, sources) {
				continue
			}
			body := fmt.Sprintf("%s: %s / %s (%s)\nOrigin: %s\n%d reports in %s", strings.TrimSpace(method+" "+operation), stage, cause, outcome, origin, count, r.policy.Window)
			if origin == "browser" {
				body += fmt.Sprintf("\n%d distinct sources", sources)
			}
			body += fmt.Sprintf("\nBuilds: %.300s", builds)
			if browsers.Valid {
				body += fmt.Sprintf("\nBrowsers: %.100s", browsers.String)
			}
			if failed > 0 {
				body += fmt.Sprintf("\nFailed items: %d", failed)
			}
			if attempted > 0 {
				body += fmt.Sprintf("\nAttempted items: %d", attempted)
			}
			if statuses.Valid {
				body += "\nHTTP statuses: " + statuses.String
			}
			if code != "unknown" {
				body += "\nCode: " + code
			}
			candidates = append(candidates, candidate{key, body, through})
			if len(candidates) == 100 {
				break
			}
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		for _, c := range candidates {
			examples, err := conn.QueryContext(ctx, `SELECT e.event_id, e.created_at, e.context FROM error_reports e
				LEFT JOIN error_alerts a ON a.fingerprint=e.fingerprint
				WHERE e.fingerprint=$1 AND e.created_at <= $2
				AND e.created_at > clock_timestamp()-($3 * interval '1 second')
				AND (a.covered_through IS NULL OR e.created_at > a.covered_through)
				ORDER BY e.created_at DESC, e.id DESC LIMIT 2`, c.key, c.through, r.policy.Window.Seconds())
			if err != nil {
				return err
			}
			for examples.Next() {
				var id sql.NullString
				var at time.Time
				var details []byte
				if err := examples.Scan(&id, &at, &details); err != nil {
					examples.Close()
					return err
				}
				c.body += fmt.Sprintf("\n\nEvent: %s at %s\n%s", id.String, at.UTC().Format(time.RFC3339), diagnosticSummary(details))
			}
			err = examples.Err()
			examples.Close()
			if err != nil {
				return err
			}
			if _, err := conn.ExecContext(ctx, `INSERT INTO error_alerts(fingerprint,pending_body,pending_through) VALUES($1,$2,$3)
				ON CONFLICT(fingerprint) DO UPDATE SET pending_body=$2,pending_through=$3,attempts=0,next_attempt=NOW()`, c.key, c.body, c.through); err != nil {
				return err
			}
		}
		rows, err = conn.QueryContext(ctx, `SELECT fingerprint,pending_body FROM error_alerts WHERE pending_body IS NOT NULL AND next_attempt <= NOW() ORDER BY next_attempt LIMIT 10`)
		if err != nil {
			return err
		}
		var pending []candidate
		for rows.Next() {
			var c candidate
			if err := rows.Scan(&c.key, &c.body); err != nil {
				rows.Close()
				return err
			}
			pending = append(pending, c)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		for _, c := range pending {
			if err := r.ntfy.SendErrorNotification(ctx, c.body); err != nil {
				log.Printf("Error alert delivery failed: %v", err)
				if _, err := conn.ExecContext(ctx, `UPDATE error_alerts SET attempts=attempts+1,next_attempt=NOW()+(LEAST(3600,30*power(2,LEAST(attempts,7))) * interval '1 second') WHERE fingerprint=$1`, c.key); err != nil {
					return err
				}
				continue
			}
			if _, err := conn.ExecContext(ctx, `UPDATE error_alerts SET notified_at=clock_timestamp(),covered_through=pending_through,pending_body=NULL,pending_through=NULL,attempts=0 WHERE fingerprint=$1`, c.key); err != nil {
				return err
			}
		}
		if _, err := conn.ExecContext(ctx, `DELETE FROM error_reports WHERE created_at < clock_timestamp()-($1 * interval '1 second')`, r.policy.Retention.Seconds()); err != nil {
			return err
		}
		_, err = conn.ExecContext(ctx, `DELETE FROM error_alerts WHERE pending_body IS NULL AND notified_at < clock_timestamp()-($1 * interval '1 second')`, r.policy.Retention.Seconds())
		return err
	})
}

type errorContextKey struct{}

func WithRequestError(ctx context.Context, e *ErrorEvent) context.Context {
	return context.WithValue(ctx, errorContextKey{}, e)
}

// AnnotateError adds a specific stage to the request's single report. Generic
// HTTP reporting supplies the operation. Later cancellation must not erase an
// earlier annotation; failures detected after cancellation are ignored here.
func AnnotateError(ctx context.Context, stage, cause, outcome string) {
	if ctx.Err() != nil {
		return
	}
	if e, ok := ctx.Value(errorContextKey{}).(*ErrorEvent); ok {
		e.Stage, e.Cause, e.Outcome = stage, cause, outcome
	}
}

func AnnotateErrorCode(ctx context.Context, code string) {
	if ctx.Err() != nil {
		return
	}
	if e, ok := ctx.Value(errorContextKey{}).(*ErrorEvent); ok {
		e.Code = SafeErrorCode(code)
	}
}
