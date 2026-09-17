package services

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"syscall"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

func TestDatabaseErrorCode(t *testing.T) {
	for _, tc := range []struct {
		name string
		err  error
		want string
	}{
		{"numeric range", &pgconn.PgError{Code: "22003", Message: "private SQL details"}, "db_numeric_out_of_range"},
		{"deadline", context.DeadlineExceeded, "db_timeout"},
		{"network timeout", &net.DNSError{IsTimeout: true}, "db_timeout"},
		{"canceled context", context.Canceled, "db_query_canceled"},
		{"canceled statement", &pgconn.PgError{Code: "57014"}, "db_query_canceled"},
		{"connection exception", &pgconn.PgError{Code: "08006"}, "db_connection_failed"},
		{"shutdown", &pgconn.PgError{Code: "57P01"}, "db_connection_failed"},
		{"crash shutdown", &pgconn.PgError{Code: "57P02"}, "db_connection_failed"},
		{"starting up", &pgconn.PgError{Code: "57P03"}, "db_connection_failed"},
		{"connection limit", &pgconn.PgError{Code: "53300"}, "db_connection_failed"},
		{"bad connection", driver.ErrBadConn, "db_connection_failed"},
		{"closed connection", sql.ErrConnDone, "db_connection_failed"},
		{"connection refused", &net.OpError{Op: "dial", Net: "tcp", Err: syscall.ECONNREFUSED}, "db_connection_failed"},
		{"query failure", &pgconn.PgError{Code: "42703"}, "db_query_failed"},
		{"unclassified", errors.New("private error: underflow timeout"), "unknown"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			for _, err := range []error{tc.err, fmt.Errorf("query recommendations: %w", tc.err)} {
				if got := DatabaseErrorCode(err); got != tc.want {
					t.Fatalf("got %q, want %q", got, tc.want)
				}
				if SafeErrorCode(tc.want) != tc.want {
					t.Fatalf("code %q not allowlisted", tc.want)
				}
			}
		})
	}
	if got := DatabaseErrorCode(nil); got != "unknown" {
		t.Fatal(got)
	}
}

func TestAnnotateErrorCode(t *testing.T) {
	event := ErrorEvent{}
	ctx, cancel := context.WithCancel(WithRequestError(context.Background(), &event))
	defer cancel()
	AnnotateErrorCode(ctx, "private SQL details")
	if event.Code != "unknown" {
		t.Fatal("unrecognized code was not sanitized")
	}
	AnnotateErrorCode(ctx, "db_numeric_out_of_range")
	AnnotateError(ctx, "response", "unavailable", "degraded")
	cancel()
	AnnotateErrorCode(ctx, "db_query_canceled")
	if event.Code != "db_numeric_out_of_range" {
		t.Fatalf("annotation lost: %+v", event)
	}
	AnnotateErrorCode(context.Background(), "db_query_failed")
}

func TestIntegrationDatabaseErrorCodesInAlerts(t *testing.T) {
	db := integrationDatabase(t)
	if err := db.Migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	bodies := make(chan string, 2)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		bodies <- string(body)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	policy := testErrorPolicy()
	policy.ServerCount = 1
	reporter := NewErrorReporter(db.DB(), "test-build", policy, NewNtfyService(server.URL, "errors", "", 3, ""))
	for _, sqlstate := range []string{"22003", "42703"} {
		event := ErrorEvent{Operation: "recommendations", Method: "GET", Stage: "response", Cause: "unavailable", Outcome: "degraded", Status: 500,
			Code: DatabaseErrorCode(fmt.Errorf("query: %w", &pgconn.PgError{Code: sqlstate, Message: "private SQL details"}))}
		if err := reporter.Record(context.Background(), "server", "", event); err != nil {
			t.Fatal(err)
		}
	}
	if err := reporter.Process(); err != nil {
		t.Fatal(err)
	}
	if len(bodies) != 2 {
		t.Fatalf("got %d alerts, want separate alerts for each code", len(bodies))
	}
	combined := <-bodies + <-bodies
	for _, code := range []string{"db_numeric_out_of_range", "db_query_failed"} {
		if !strings.Contains(combined, "Code: "+code) {
			t.Fatalf("missing code %s in alerts: %s", code, combined)
		}
	}
	if strings.Contains(combined, "private SQL details") {
		t.Fatal("raw error leaked into alert")
	}
}
