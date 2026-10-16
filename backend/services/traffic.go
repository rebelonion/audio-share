package services

import (
	"context"
	"crypto/rand"
	"database/sql"
	"fmt"
	"log"
	"sync"
	"sync/atomic"
	"time"
)

// TrafficKind groups public responses for throughput accounting.
type TrafficKind int

const (
	TrafficStream TrafficKind = iota
	TrafficDownload
	TrafficArtwork
	TrafficAPI
	TrafficWeb
	trafficKindCount
)

var trafficKindNames = [trafficKindCount]string{"stream", "download", "artwork", "api", "web"}

func (k TrafficKind) String() string { return trafficKindNames[k] }

const (
	trafficSampleInterval = 5 * time.Second
	trafficFlushEvery     = 2 // samples, so totals are persisted every 10 seconds
	trafficLiveSamples    = 120
	trafficMinuteRetain   = 8 * 24 * time.Hour
)

const (
	// Unsaved counts older than this are dropped during a database outage.
	trafficPendingLimit = 24 * time.Hour
	// Saved batch IDs must outlive any retry of the same batch.
	trafficBatchRetain = 2 * trafficPendingLimit
)

type trafficCounter struct {
	bytes, requests atomic.Int64
}

// TrafficCount is a byte and request total.
type TrafficCount struct {
	Bytes    int64 `json:"bytes"`
	Requests int64 `json:"requests"`
}

func (c TrafficCount) plus(o TrafficCount) TrafficCount {
	return TrafficCount{Bytes: c.Bytes + o.Bytes, Requests: c.Requests + o.Requests}
}

type trafficBucket struct {
	minute time.Time
	kind   TrafficKind
}

// trafficBatch is a set of buckets being saved. Its ID is recorded in the same
// transaction, so retrying a batch whose commit outcome was unknown cannot
// count it twice.
type trafficBatch struct {
	id      string
	buckets map[trafficBucket]TrafficCount
}

// TrafficMeter counts response bytes in memory and samples them every five
// seconds. Samples feed a short live history for this instance and are
// assigned to the minute they were sent in, then added to shared minute and
// hour buckets. Additive upserts keep totals correct while instances overlap.
// Sampling and saving run in separate goroutines, so a slow database cannot
// delay a sample past its interval.
type TrafficMeter struct {
	db       *sql.DB
	counters [trafficKindCount]trafficCounter
	// Errors receives save problems, so they reach Recent errors and alerts.
	Errors *ErrorReporter

	mu      sync.Mutex
	sampled [trafficKindCount]TrafficCount
	lastAt  time.Time
	live    []TrafficSample
	pending map[trafficBucket]TrafficCount
	// batch.buckets changes only in the saving goroutine or after it stops.
	batch     *trafficBatch
	discarded TrafficCount
	saving    trafficSaving

	started atomic.Bool
	stop    chan struct{}
	workers sync.WaitGroup
	once    sync.Once
}

type trafficSaving struct {
	savedAt, failingSince, reportedAt, pruned time.Time
	lastError, pruneError                     string
}

// TrafficSample is the bytes sent by this instance during one live interval.
// Seconds is the interval's real length; the first after start is shorter.
type TrafficSample struct {
	At      time.Time `json:"at"`
	Bytes   int64     `json:"bytes"`
	Seconds float64   `json:"seconds"`
}

// TrafficSaving shows whether this instance is saving its counts.
type TrafficSaving struct {
	LastSavedAt  *time.Time   `json:"lastSavedAt"`
	FailingSince *time.Time   `json:"failingSince"`
	LastError    string       `json:"lastError"`
	Unsaved      TrafficCount `json:"unsaved"`
	PruneError   string       `json:"pruneError"`
}

// TrafficLive is this instance's recent throughput and save status. The admin
// handler fills in open media responses from the server lifecycle.
type TrafficLive struct {
	IntervalSeconds int             `json:"intervalSeconds"`
	Samples         []TrafficSample `json:"samples"`
	ActiveStreams   int64           `json:"activeStreams"`
	ActiveDownloads int64           `json:"activeDownloads"`
	// Discarded is traffic this instance counted but could not save.
	Discarded TrafficCount  `json:"discarded"`
	Saving    TrafficSaving `json:"saving"`
}

const trafficFailureReportEvery = time.Minute

func NewTrafficMeter(db *sql.DB) *TrafficMeter {
	return &TrafficMeter{db: db, pending: map[trafficBucket]TrafficCount{}, stop: make(chan struct{})}
}

func (m *TrafficMeter) Request(kind TrafficKind) {
	m.counters[kind].requests.Add(1)
}

func (m *TrafficMeter) Add(kind TrafficKind, bytes int64) {
	if bytes > 0 {
		m.counters[kind].bytes.Add(bytes)
	}
}

// Count returns this instance's totals for kind since it started.
func (m *TrafficMeter) Count(kind TrafficKind) TrafficCount {
	return TrafficCount{Bytes: m.counters[kind].bytes.Load(), Requests: m.counters[kind].requests.Load()}
}

func (m *TrafficMeter) Start() {
	if !m.started.CompareAndSwap(false, true) {
		return
	}
	m.mu.Lock()
	m.lastAt = time.Now()
	m.mu.Unlock()
	m.workers.Add(2)
	go m.sampleLoop()
	go m.saveLoop()
}

// Close stops both loops and saves what is left, retrying until a deadline.
func (m *TrafficMeter) Close() {
	if m == nil || !m.started.Load() {
		return
	}
	m.once.Do(func() {
		close(m.stop)
		m.workers.Wait()
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		now := time.Now()
		m.sample(now)
		// A batch from an earlier failure may need saving before the final
		// counts, and the database may be briefly away during a deploy.
		for m.hasUnsaved() {
			err := m.flush(ctx, now)
			if err == nil {
				continue
			}
			if SleepContext(ctx, 500*time.Millisecond) != nil {
				log.Printf("Traffic totals were not saved at shutdown: %v", err)
				m.mu.Lock()
				lost := m.discardLocked(func(trafficBucket) bool { return true })
				m.mu.Unlock()
				m.reportDiscard(lost, "at shutdown")
				return
			}
		}
	})
}

func (m *TrafficMeter) hasUnsaved() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.pending) > 0 || m.batch != nil
}

// sampleLoop samples on wall-clock multiples of the interval, so no sample
// spans a minute boundary and every byte is filed under its minute.
func (m *TrafficMeter) sampleLoop() {
	defer m.workers.Done()
	for {
		next := time.Now().Truncate(trafficSampleInterval).Add(trafficSampleInterval)
		timer := time.NewTimer(time.Until(next))
		select {
		case <-m.stop:
			timer.Stop()
			return
		case <-timer.C:
		}
		m.sample(next)
	}
}

func (m *TrafficMeter) saveLoop() {
	defer m.workers.Done()
	ticker := time.NewTicker(trafficSampleInterval * trafficFlushEvery)
	defer ticker.Stop()
	for {
		select {
		case <-m.stop:
			return
		case now := <-ticker.C:
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			// Failures are logged, reported, and shown by flush; counts are kept.
			_ = m.flush(ctx, now)
			cancel()
		}
	}
}

// sample files counts since the previous sample under the minute containing
// the interval that ends at end.
func (m *TrafficMeter) sample(end time.Time) {
	minute := end.UTC().Add(-time.Nanosecond).Truncate(time.Minute)
	m.mu.Lock()
	defer m.mu.Unlock()
	var sent int64
	for i := range m.counters {
		current := m.Count(TrafficKind(i))
		delta := TrafficCount{Bytes: current.Bytes - m.sampled[i].Bytes, Requests: current.Requests - m.sampled[i].Requests}
		m.sampled[i] = current
		sent += delta.Bytes
		if delta != (TrafficCount{}) {
			key := trafficBucket{minute, TrafficKind(i)}
			m.pending[key] = m.pending[key].plus(delta)
		}
	}
	seconds := trafficSampleInterval.Seconds()
	if !m.lastAt.IsZero() {
		seconds = end.Sub(m.lastAt).Seconds()
	}
	m.lastAt = end
	m.live = append(m.live, TrafficSample{At: end.UTC(), Bytes: sent, Seconds: seconds})
	if len(m.live) > trafficLiveSamples {
		m.live = m.live[len(m.live)-trafficLiveSamples:]
	}
}

func (m *TrafficMeter) Live() TrafficLive {
	live := TrafficLive{IntervalSeconds: int(trafficSampleInterval / time.Second), Samples: []TrafficSample{}}
	if m == nil {
		return live
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	live.Samples = append(live.Samples, m.live...)
	live.Discarded = m.discarded
	optional := func(at time.Time) *time.Time {
		if at.IsZero() {
			return nil
		}
		at = at.UTC()
		return &at
	}
	live.Saving = TrafficSaving{
		LastSavedAt:  optional(m.saving.savedAt),
		FailingSince: optional(m.saving.failingSince),
		LastError:    m.saving.lastError,
		PruneError:   m.saving.pruneError,
	}
	for _, buckets := range []map[trafficBucket]TrafficCount{m.pending, m.batchBuckets()} {
		for _, count := range buckets {
			live.Saving.Unsaved = live.Saving.Unsaved.plus(count)
		}
	}
	return live
}

// flush saves the current batch, or starts one from the pending counts. A
// failed batch is retried unchanged with the same ID; counts sampled in the
// meantime wait for the next batch.
func (m *TrafficMeter) flush(ctx context.Context, now time.Time) error {
	m.mu.Lock()
	if m.batch == nil && len(m.pending) > 0 {
		m.batch = &trafficBatch{id: rand.Text(), buckets: m.pending}
		m.pending = map[trafficBucket]TrafficCount{}
	}
	batch := m.batch
	m.mu.Unlock()

	if batch != nil {
		err := m.write(ctx, batch)
		m.mu.Lock()
		if err != nil {
			// Bound memory during a long database outage.
			lost := m.discardLocked(func(key trafficBucket) bool { return now.Sub(key.minute) > trafficPendingLimit })
			report := m.saveFailedLocked(now, err)
			m.mu.Unlock()
			log.Printf("Saving traffic totals failed: %v", err)
			m.reportDiscard(lost, "older than "+trafficPendingLimit.String())
			if report != nil {
				m.Errors.Report("server", *report)
			}
			return err
		}
		m.batch = nil
		if !m.saving.failingSince.IsZero() {
			log.Printf("Saving traffic totals recovered after failing since %s", m.saving.failingSince.UTC().Format(time.RFC3339))
		}
		m.saving.savedAt, m.saving.failingSince, m.saving.lastError = now, time.Time{}, ""
		m.mu.Unlock()
	}

	// Cleanup is separate and best effort, so it can never block saving.
	m.mu.Lock()
	due := now.Sub(m.saving.pruned) >= time.Hour
	if due {
		m.saving.pruned = now
	}
	m.mu.Unlock()
	if due {
		err := m.prune(ctx, now)
		m.mu.Lock()
		m.saving.pruneError = ""
		if err != nil {
			m.saving.pruneError = err.Error()
		}
		m.mu.Unlock()
		if err != nil {
			log.Printf("Pruning old traffic rows failed; retrying in an hour: %v", err)
			details := ErrorDetails(err)
			details.Step = "prune"
			m.Errors.Report("server", ErrorEvent{Operation: "traffic", Stage: "run", Cause: trafficCause(err), Code: DatabaseErrorCode(err), Outcome: "degraded", Context: details})
		}
	}
	return nil
}

// saveFailedLocked records a failed save and returns a report at most once a
// minute while saving keeps failing.
func (m *TrafficMeter) saveFailedLocked(now time.Time, err error) *ErrorEvent {
	if m.saving.failingSince.IsZero() {
		m.saving.failingSince = now
	}
	m.saving.lastError = err.Error()
	if now.Sub(m.saving.reportedAt) < trafficFailureReportEvery {
		return nil
	}
	m.saving.reportedAt = now
	var waiting TrafficCount
	for _, buckets := range []map[trafficBucket]TrafficCount{m.pending, m.batchBuckets()} {
		for _, count := range buckets {
			waiting = waiting.plus(count)
		}
	}
	details := ErrorDetails(err)
	details.Step = "save"
	details.Message = fmt.Sprintf("Traffic totals not saved since %s; %d bytes and %d requests waiting: %s",
		m.saving.failingSince.UTC().Format(time.RFC3339), waiting.Bytes, waiting.Requests, details.Message)
	return &ErrorEvent{Operation: "traffic", Stage: "store", Cause: trafficCause(err), Code: DatabaseErrorCode(err), Outcome: "degraded", Context: details}
}

func trafficCause(err error) string {
	switch DatabaseErrorCode(err) {
	case "db_timeout":
		return "timeout"
	case "db_connection_failed":
		return "unavailable"
	}
	return "unexpected"
}

// reportDiscard reports lost counts. It uses the worker origin, whose alert
// threshold is a single report, because lost data cannot be recovered.
func (m *TrafficMeter) reportDiscard(lost TrafficCount, reason string) {
	if lost == (TrafficCount{}) {
		return
	}
	message := fmt.Sprintf("Discarded unsaved traffic %s: %d bytes, %d requests", reason, lost.Bytes, lost.Requests)
	log.Print(message)
	m.Errors.Report("worker", ErrorEvent{Operation: "traffic", Stage: "store", Cause: "partial-failure", Outcome: "degraded",
		FailedItems: int(lost.Requests), Context: ErrorContext{Step: "discard", Message: message}})
}

func (m *TrafficMeter) prune(ctx context.Context, now time.Time) error {
	if _, err := m.db.ExecContext(ctx, `DELETE FROM traffic_minutes WHERE minute < $1`, now.Add(-trafficMinuteRetain)); err != nil {
		return err
	}
	_, err := m.db.ExecContext(ctx, `DELETE FROM traffic_batches WHERE saved_at < $1`, now.Add(-trafficBatchRetain))
	return err
}

// discardLocked drops matching unsaved buckets and returns what was lost.
// Only the saving goroutine, or Close after it stops, may call it.
func (m *TrafficMeter) discardLocked(match func(trafficBucket) bool) TrafficCount {
	var lost TrafficCount
	for _, buckets := range []map[trafficBucket]TrafficCount{m.pending, m.batchBuckets()} {
		for key, count := range buckets {
			if match(key) {
				lost = lost.plus(count)
				delete(buckets, key)
			}
		}
	}
	if m.batch != nil && len(m.batch.buckets) == 0 {
		m.batch = nil
	}
	m.discarded = m.discarded.plus(lost)
	return lost
}

func (m *TrafficMeter) batchBuckets() map[trafficBucket]TrafficCount {
	if m.batch == nil {
		return nil
	}
	return m.batch.buckets
}

func (m *TrafficMeter) write(ctx context.Context, batch *trafficBatch) error {
	tx, err := m.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	{
		saved, err := tx.ExecContext(ctx, `INSERT INTO traffic_batches (id) VALUES ($1) ON CONFLICT DO NOTHING`, batch.id)
		if err != nil {
			return err
		}
		if added, err := saved.RowsAffected(); err != nil {
			return err
		} else if added == 1 {
			if err := writeTrafficBuckets(ctx, tx, batch.buckets); err != nil {
				return err
			}
		}
		// Otherwise an earlier attempt committed this batch already.
	}
	return tx.Commit()
}

func writeTrafficBuckets(ctx context.Context, tx *sql.Tx, minutes map[trafficBucket]TrafficCount) error {
	hours := map[trafficBucket]TrafficCount{}
	totals := map[TrafficKind]TrafficCount{}
	first := map[TrafficKind]time.Time{}
	for key, count := range minutes {
		hour := trafficBucket{key.minute.Truncate(time.Hour), key.kind}
		hours[hour] = hours[hour].plus(count)
		totals[key.kind] = totals[key.kind].plus(count)
		if seen, ok := first[key.kind]; !ok || key.minute.Before(seen) {
			first[key.kind] = key.minute
		}
	}
	// One statement per table, inserting in ORDER BY order, so overlapping
	// instances lock shared rows in the same order and cannot deadlock.
	for _, batch := range []struct {
		table, column string
		buckets       map[trafficBucket]TrafficCount
	}{{"traffic_minutes", "minute", minutes}, {"traffic_hours", "hour", hours}} {
		var at []time.Time
		var kinds []string
		var bytes, requests []int64
		for key, count := range batch.buckets {
			at, kinds = append(at, key.minute), append(kinds, key.kind.String())
			bytes, requests = append(bytes, count.Bytes), append(requests, count.Requests)
		}
		if _, err := tx.ExecContext(ctx, fmt.Sprintf(`INSERT INTO %[1]s (%[2]s, kind, bytes, requests)
			SELECT * FROM unnest($1::TIMESTAMPTZ[], $2::TEXT[], $3::BIGINT[], $4::BIGINT[]) ORDER BY 1, 2
			ON CONFLICT (%[2]s, kind) DO UPDATE SET bytes = %[1]s.bytes + excluded.bytes, requests = %[1]s.requests + excluded.requests`,
			batch.table, batch.column), at, kinds, bytes, requests); err != nil {
			return err
		}
	}
	var kinds []string
	var bytes, requests []int64
	var firsts []time.Time
	for kind, count := range totals {
		kinds, firsts = append(kinds, kind.String()), append(firsts, first[kind])
		bytes, requests = append(bytes, count.Bytes), append(requests, count.Requests)
	}
	_, err := tx.ExecContext(ctx, `INSERT INTO traffic_totals (kind, bytes, requests, first_minute)
		SELECT * FROM unnest($1::TEXT[], $2::BIGINT[], $3::BIGINT[], $4::TIMESTAMPTZ[]) ORDER BY 1
		ON CONFLICT (kind) DO UPDATE SET bytes = traffic_totals.bytes + excluded.bytes, requests = traffic_totals.requests + excluded.requests,
			first_minute = LEAST(traffic_totals.first_minute, excluded.first_minute)`, kinds, bytes, requests, firsts)
	return err
}

// TrafficWindow is the traffic served during a trailing window.
type TrafficWindow struct {
	Window string                  `json:"window"`
	Total  TrafficCount            `json:"total"`
	ByKind map[string]TrafficCount `json:"byKind"`
}

// TrafficPoint is the bytes served during one chart bucket.
type TrafficPoint struct {
	At     time.Time        `json:"at"`
	Bytes  int64            `json:"bytes"`
	ByKind map[string]int64 `json:"byKind"`
}

type TrafficReport struct {
	GeneratedAt   time.Time       `json:"generatedAt"`
	TrackingSince *time.Time      `json:"trackingSince"`
	Windows       []TrafficWindow `json:"windows"`
	Range         string          `json:"range"`
	// RangeTotal covers exactly the chart's intervals, unlike the trailing windows.
	RangeTotal    TrafficWindow  `json:"rangeTotal"`
	BucketSeconds int            `json:"bucketSeconds"`
	Points        []TrafficPoint `json:"points"`
}

type trafficRange struct {
	table, column string
	bucket        time.Duration
	points        int
}

var trafficRanges = map[string]trafficRange{
	"1h":  {"traffic_minutes", "minute", time.Minute, 60},
	"24h": {"traffic_minutes", "minute", 10 * time.Minute, 144},
	"7d":  {"traffic_hours", "hour", time.Hour, 168},
	"30d": {"traffic_hours", "hour", 6 * time.Hour, 120},
}

func ValidTrafficRange(name string) bool {
	_, ok := trafficRanges[name]
	return ok
}

func ReadTraffic(ctx context.Context, db *sql.DB, rangeName string) (*TrafficReport, error) {
	spec, ok := trafficRanges[rangeName]
	if !ok {
		return nil, fmt.Errorf("unknown traffic range %q", rangeName)
	}
	now := time.Now().UTC()
	report := &TrafficReport{GeneratedAt: now, Range: rangeName, BucketSeconds: int(spec.bucket / time.Second)}
	windows := []TrafficWindow{{Window: "1h"}, {Window: "24h"}, {Window: "7d"}, {Window: "30d"}, {Window: "all"}}
	for i := range windows {
		windows[i].ByKind = map[string]TrafficCount{}
	}
	add := func(window int, kind string, count TrafficCount) {
		windows[window].ByKind[kind] = count
		windows[window].Total.Bytes += count.Bytes
		windows[window].Total.Requests += count.Requests
	}

	// Short windows use minute buckets; long windows use the retained hours.
	rows, err := db.QueryContext(ctx, `SELECT kind,
			COALESCE(SUM(bytes) FILTER (WHERE minute >= $1), 0), COALESCE(SUM(requests) FILTER (WHERE minute >= $1), 0),
			COALESCE(SUM(bytes) FILTER (WHERE minute >= $2), 0), COALESCE(SUM(requests) FILTER (WHERE minute >= $2), 0),
			COALESCE(SUM(bytes), 0), COALESCE(SUM(requests), 0)
		FROM traffic_minutes WHERE minute >= $3 GROUP BY kind`,
		now.Add(-time.Hour), now.Add(-24*time.Hour), now.Add(-7*24*time.Hour))
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var kind string
		var counts [3]TrafficCount
		if err := rows.Scan(&kind, &counts[0].Bytes, &counts[0].Requests, &counts[1].Bytes, &counts[1].Requests, &counts[2].Bytes, &counts[2].Requests); err != nil {
			rows.Close()
			return nil, err
		}
		for i, count := range counts {
			add(i, kind, count)
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// The 30-day window reads only recent hours; all-time totals and the exact
	// first minute come from the running totals rather than a full scan.
	rows, err = db.QueryContext(ctx, `SELECT t.kind, COALESCE(h.bytes, 0), COALESCE(h.requests, 0), t.bytes, t.requests, t.first_minute
		FROM traffic_totals t
		LEFT JOIN (SELECT kind, SUM(bytes) AS bytes, SUM(requests) AS requests FROM traffic_hours WHERE hour >= $1 GROUP BY kind) h USING (kind)`,
		now.Add(-30*24*time.Hour))
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var kind string
		var month, all TrafficCount
		var first time.Time
		if err := rows.Scan(&kind, &month.Bytes, &month.Requests, &all.Bytes, &all.Requests, &first); err != nil {
			rows.Close()
			return nil, err
		}
		add(3, kind, month)
		add(4, kind, all)
		if report.TrackingSince == nil || first.Before(*report.TrackingSince) {
			first = first.UTC()
			report.TrackingSince = &first
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	report.Windows = windows

	bucket := int64(spec.bucket / time.Second)
	last := now.Unix() / bucket * bucket
	first := last - int64(spec.points-1)*bucket
	report.Points = make([]TrafficPoint, spec.points)
	for i := range report.Points {
		report.Points[i] = TrafficPoint{At: time.Unix(first+int64(i)*bucket, 0).UTC(), ByKind: map[string]int64{}}
	}
	report.RangeTotal = TrafficWindow{Window: rangeName, ByKind: map[string]TrafficCount{}}
	rows, err = db.QueryContext(ctx, fmt.Sprintf(`SELECT FLOOR(EXTRACT(EPOCH FROM %[2]s) / $2::BIGINT)::BIGINT * $2::BIGINT, kind, SUM(bytes), SUM(requests)
		FROM %[1]s WHERE %[2]s >= $1 GROUP BY 1, 2`, spec.table, spec.column), time.Unix(first, 0), bucket)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var at int64
		var kind string
		var count TrafficCount
		if err := rows.Scan(&at, &kind, &count.Bytes, &count.Requests); err != nil {
			return nil, err
		}
		if index := (at - first) / bucket; index >= 0 && index < int64(len(report.Points)) {
			report.Points[index].ByKind[kind] += count.Bytes
			report.Points[index].Bytes += count.Bytes
			report.RangeTotal.ByKind[kind] = report.RangeTotal.ByKind[kind].plus(count)
			report.RangeTotal.Total = report.RangeTotal.Total.plus(count)
		}
	}
	return report, rows.Err()
}
