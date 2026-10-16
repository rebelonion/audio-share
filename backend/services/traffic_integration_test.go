package services

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"
)

func TestIntegrationTrafficFlushAccumulatesAndReports(t *testing.T) {
	db := integrationDatabase(t)
	ctx := context.Background()
	if err := db.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := db.db.Exec(`INSERT INTO traffic_minutes(minute,kind,bytes,requests) VALUES (NOW() - INTERVAL '9 days','stream',1,1)`); err != nil {
		t.Fatal(err)
	}
	meter := NewTrafficMeter(db.db)
	now := time.Now()
	meter.Request(TrafficStream)
	meter.Add(TrafficStream, 1000)
	meter.Add(TrafficAPI, 50)
	meter.sample(now)
	if err := meter.flush(ctx, now); err != nil {
		t.Fatal(err)
	}
	meter.Add(TrafficStream, 500)
	meter.sample(now)
	if err := meter.flush(ctx, now); err != nil {
		t.Fatal(err)
	}
	// A second instance adds to the same buckets instead of replacing them.
	other := NewTrafficMeter(db.db)
	other.Add(TrafficStream, 25)
	other.sample(now)
	if err := other.flush(ctx, now); err != nil {
		t.Fatal(err)
	}

	var stale int
	if err := db.db.QueryRow(`SELECT COUNT(*) FROM traffic_minutes WHERE minute < NOW() - INTERVAL '8 days'`).Scan(&stale); err != nil {
		t.Fatal(err)
	}
	if stale != 0 {
		t.Fatalf("expired minute buckets were not pruned")
	}

	report, err := ReadTraffic(ctx, db.db, "1h")
	if err != nil {
		t.Fatal(err)
	}
	for _, window := range report.Windows {
		if window.Total.Bytes != 1575 || window.Total.Requests != 1 {
			t.Fatalf("%s total = %+v", window.Window, window.Total)
		}
		if window.ByKind["stream"].Bytes != 1525 || window.ByKind["api"].Bytes != 50 {
			t.Fatalf("%s by kind = %+v", window.Window, window.ByKind)
		}
	}
	if len(report.Points) != 60 || report.BucketSeconds != 60 {
		t.Fatalf("points=%d bucket=%d", len(report.Points), report.BucketSeconds)
	}
	var streamed int64
	for _, point := range report.Points {
		streamed += point.ByKind["stream"]
	}
	if streamed != 1525 {
		t.Fatalf("1h stream series total = %d", streamed)
	}
	if report.RangeTotal.Total != (TrafficCount{Bytes: 1575, Requests: 1}) || report.RangeTotal.ByKind["api"].Bytes != 50 {
		t.Fatalf("range total = %+v", report.RangeTotal)
	}
	if want := now.UTC().Add(-time.Nanosecond).Truncate(time.Minute); report.TrackingSince == nil || !report.TrackingSince.Equal(want) {
		t.Fatalf("tracking since = %v, want first counted minute %v", report.TrackingSince, want)
	}
	for _, name := range []string{"24h", "7d", "30d"} {
		report, err := ReadTraffic(ctx, db.db, name)
		if err != nil {
			t.Fatal(err)
		}
		var total int64
		for _, point := range report.Points {
			total += point.Bytes
		}
		if total != 1575 {
			t.Fatalf("%s series total = %d", name, total)
		}
	}
}

func TestIntegrationTrafficKeepsSendMinuteAcrossFailedFlush(t *testing.T) {
	db := integrationDatabase(t)
	ctx := context.Background()
	if err := db.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	meter := NewTrafficMeter(db.db)
	first := time.Date(2026, 10, 16, 11, 58, 30, 0, time.UTC)
	second := first.Add(2 * time.Minute)
	meter.Add(TrafficDownload, 100)
	meter.sample(first)
	failed, cancel := context.WithCancel(ctx)
	cancel()
	if err := meter.flush(failed, first); err == nil {
		t.Fatal("flush with a cancelled context succeeded")
	}
	meter.Add(TrafficDownload, 7)
	meter.sample(second)
	// The first flush retries the failed batch; the second saves newer counts.
	for range 2 {
		if err := meter.flush(ctx, second); err != nil {
			t.Fatal(err)
		}
	}

	rows, err := db.db.Query(`SELECT minute, bytes FROM traffic_minutes ORDER BY minute`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var got []string
	for rows.Next() {
		var minute time.Time
		var bytes int64
		if err := rows.Scan(&minute, &bytes); err != nil {
			t.Fatal(err)
		}
		got = append(got, fmt.Sprintf("%s=%d", minute.UTC().Format("15:04"), bytes))
	}
	if want := []string{"11:58=100", "12:00=7"}; len(got) != 2 || got[0] != want[0] || got[1] != want[1] {
		t.Fatalf("minute rows = %v, want %v", got, want)
	}
	var hours int
	if err := db.db.QueryRow(`SELECT COUNT(*) FROM traffic_hours`).Scan(&hours); err != nil {
		t.Fatal(err)
	}
	if hours != 2 {
		t.Fatalf("hour rows = %d, want 2", hours)
	}
}

func TestTrafficCloseWithoutStartReturns(t *testing.T) {
	done := make(chan struct{})
	go func() { NewTrafficMeter(nil).Close(); close(done) }()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("Close blocked on a meter that was never started")
	}
}

func TestIntegrationTrafficOverlappingFlushesDoNotDeadlock(t *testing.T) {
	db := integrationDatabase(t)
	ctx := context.Background()
	if err := db.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	base := time.Now().UTC().Truncate(time.Hour)
	const instances, rounds = 4, 40
	var wg sync.WaitGroup
	errs := make(chan error, instances*rounds)
	for range instances {
		wg.Add(1)
		go func() {
			defer wg.Done()
			meter := NewTrafficMeter(db.db)
			for round := range rounds {
				// Many shared minute, hour, and total rows per flush, in map order.
				for minute := range 30 {
					for kind := range trafficKindCount {
						meter.Request(kind)
						meter.Add(kind, 1)
						meter.sample(base.Add(time.Duration(minute*3) * time.Minute))
					}
				}
				if err := meter.flush(ctx, base.Add(time.Duration(round)*time.Second)); err != nil {
					errs <- err
					return
				}
			}
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Fatal(err)
	}
	var bytes, requests int64
	if err := db.db.QueryRow(`SELECT SUM(bytes), SUM(requests) FROM traffic_totals`).Scan(&bytes, &requests); err != nil {
		t.Fatal(err)
	}
	if want := int64(instances * rounds * 30 * int(trafficKindCount)); bytes != want || requests != want {
		t.Fatalf("totals = %d bytes, %d requests, want %d each", bytes, requests, want)
	}
}

func TestIntegrationTrafficRetriedBatchIsCountedOnce(t *testing.T) {
	db := integrationDatabase(t)
	ctx := context.Background()
	if err := db.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	meter := NewTrafficMeter(db.db)
	now := time.Now()
	buckets := func() map[trafficBucket]TrafficCount {
		return map[trafficBucket]TrafficCount{{now.UTC().Truncate(time.Minute), TrafficStream}: {Bytes: 900, Requests: 3}}
	}
	// The second attempt models a retry after a commit whose outcome was unknown.
	for range 2 {
		meter.batch = &trafficBatch{id: "same-batch", buckets: buckets()}
		if err := meter.flush(ctx, now); err != nil {
			t.Fatal(err)
		}
	}
	for _, table := range []string{"traffic_minutes", "traffic_hours", "traffic_totals"} {
		var bytes, requests int64
		if err := db.db.QueryRow(`SELECT SUM(bytes), SUM(requests) FROM `+table).Scan(&bytes, &requests); err != nil {
			t.Fatal(err)
		}
		if bytes != 900 || requests != 3 {
			t.Fatalf("%s = %d bytes, %d requests; a retried batch was counted twice", table, bytes, requests)
		}
	}
}

func TestIntegrationTrafficSavesWhenPruningFails(t *testing.T) {
	db := integrationDatabase(t)
	ctx := context.Background()
	if err := db.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := db.db.Exec(`
		CREATE FUNCTION reject_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'delete rejected'; END $$;
		CREATE TRIGGER reject_delete BEFORE DELETE ON traffic_minutes FOR EACH ROW EXECUTE FUNCTION reject_delete();
		INSERT INTO traffic_minutes(minute, kind, bytes, requests) VALUES (NOW() - INTERVAL '9 days', 'web', 1, 1);`); err != nil {
		t.Fatal(err)
	}
	meter := NewTrafficMeter(db.db)
	meter.Errors = testErrorReporter(db)
	now := time.Now()
	meter.Add(TrafficWeb, 42)
	meter.sample(now)
	if err := meter.flush(ctx, now); err != nil {
		t.Fatalf("flush failed because pruning failed: %v", err)
	}
	if meter.Live().Saving.PruneError == "" {
		t.Fatal("prune failure is not shown in the live status")
	}
	assertTrafficReport(t, db, "server", "run")
	var bytes int64
	if err := db.db.QueryRow(`SELECT bytes FROM traffic_totals WHERE kind = 'web'`).Scan(&bytes); err != nil || bytes != 42 {
		t.Fatalf("saved web bytes = %d, err = %v", bytes, err)
	}
}

func testErrorReporter(db *Database) *ErrorReporter {
	return NewErrorReporter(db.db, "test", ErrorPolicy{Window: time.Minute, Cooldown: time.Minute, Retention: time.Hour, BrowserCount: 1, BrowserSources: 1, ServerCount: 1, MutationCount: 1, JobCount: 1}, nil)
}

func assertTrafficReport(t *testing.T, db *Database, origin, stage string) {
	t.Helper()
	var count int
	if err := db.db.QueryRow(`SELECT COUNT(*) FROM error_reports WHERE operation = 'traffic' AND origin = $1 AND stage = $2`, origin, stage).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("%s/%s traffic reports = %d, want 1", origin, stage, count)
	}
}

func TestIntegrationTrafficSaveFailureIsReportedAndRecovers(t *testing.T) {
	db := integrationDatabase(t)
	ctx := context.Background()
	if err := db.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	meter := NewTrafficMeter(db.db)
	meter.Errors = testErrorReporter(db)
	now := time.Now()
	meter.Add(TrafficStream, 5)
	meter.sample(now)
	failed, cancel := context.WithCancel(ctx)
	cancel()
	if err := meter.flush(failed, now); err == nil {
		t.Fatal("flush with a cancelled context succeeded")
	}
	assertTrafficReport(t, db, "server", "store")
	if saving := meter.Live().Saving; saving.FailingSince == nil || saving.Unsaved.Bytes != 5 {
		t.Fatalf("failing status = %+v", saving)
	}
	if err := meter.flush(ctx, now.Add(10*time.Second)); err != nil {
		t.Fatal(err)
	}
	if saving := meter.Live().Saving; saving.FailingSince != nil || saving.LastError != "" || saving.LastSavedAt == nil || saving.Unsaved != (TrafficCount{}) {
		t.Fatalf("recovered status = %+v", saving)
	}
}

func TestIntegrationTrafficDiscardIsReported(t *testing.T) {
	db := integrationDatabase(t)
	ctx := context.Background()
	if err := db.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	meter := NewTrafficMeter(db.db)
	meter.Errors = testErrorReporter(db)
	old := time.Now().Add(-25 * time.Hour)
	meter.Request(TrafficStream)
	meter.Add(TrafficStream, 9)
	meter.sample(old)
	failed, cancel := context.WithCancel(ctx)
	cancel()
	_ = meter.flush(failed, time.Now())
	assertTrafficReport(t, db, "worker", "store")
	if got := meter.Live().Discarded; got != (TrafficCount{Bytes: 9, Requests: 1}) {
		t.Fatalf("discarded = %+v", got)
	}
}

func TestIntegrationTrafficMeterRunsConcurrently(t *testing.T) {
	db := integrationDatabase(t)
	if err := db.Migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	meter := NewTrafficMeter(db.db)
	meter.Start()
	deadline := time.Now().Add(11 * time.Second)
	for time.Now().Before(deadline) {
		meter.Request(TrafficWeb)
		meter.Add(TrafficWeb, 100)
		_ = meter.Live()
		time.Sleep(5 * time.Millisecond)
	}
	meter.Close()
	var bytes int64
	if err := db.db.QueryRow(`SELECT COALESCE(SUM(bytes), 0) FROM traffic_totals`).Scan(&bytes); err != nil {
		t.Fatal(err)
	}
	if want := meter.Count(TrafficWeb).Bytes; bytes != want {
		t.Fatalf("saved %d bytes, counted %d", bytes, want)
	}
}
