package services

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"os/exec"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const waveformNumPeaks = 500
const waveformSampleRate = 8000
const waveformMinDB = -52.0

// chapterProbeTimeout bounds a single ffprobe metadata read so a stalled mount cannot hold the job lock.
// In-flight probes get the full timeout even past the job deadline, like in-flight waveform generation.
const chapterProbeTimeout = 2 * time.Minute

// chapterRetryInterval spaces out re-probes of files whose chapter probe keeps failing.
const chapterRetryInterval = 24 * time.Hour

type WaveformService struct {
	db      *sql.DB
	fs      *FileSystemService
	workers int
	Errors  *ErrorReporter
}

func NewWaveformService(db *sql.DB, fs *FileSystemService, workers int) *WaveformService {
	if workers < 1 {
		workers = 1
	}
	return &WaveformService{db: db, fs: fs, workers: workers}
}

func (s *WaveformService) GetByShareKey(shareKey string) (string, float64, error) {
	var peaks string
	var duration sql.NullFloat64
	err := s.db.QueryRow(`
		SELECT wc.peaks, wc.duration_seconds
		FROM waveform_cache wc
		JOIN audio_files af ON af.id = wc.audio_file_id
		WHERE af.share_key = $1
	`, shareKey).Scan(&peaks, &duration)
	return peaks, duration.Float64, err
}

func (s *WaveformService) RunJob(maxDuration time.Duration) error {
	err := withJobLock(s.db, "waveform", func(conn *sql.Conn) error {
		run := beginJobRun(conn, "waveform")
		var summary JobSummary
		err := s.runJob(conn, maxDuration, &summary)
		run.finish(summary, err)
		return err
	})
	if err != nil {
		s.Errors.Report("worker", ErrorEvent{Operation: "waveform", Stage: "run", Cause: "unexpected", Outcome: "blocked", Context: ErrorDetails(err)})
	}
	return err
}

func (s *WaveformService) runJob(conn *sql.Conn, maxDuration time.Duration, summary *JobSummary) error {
	var processed, failed, attempted atomic.Int64
	var examples FailureExamples
	defer func() {
		*summary = JobSummary{Attempted: attempted.Load(), Processed: processed.Load(), Issues: failed.Load(), Details: examples.Context()}
	}()
	ctx, cancel := context.WithCancelCause(context.Background())
	defer cancel(nil)
	start := time.Now()
	log.Println("Waveform: starting generation job")

	rows, err := conn.QueryContext(ctx, `
		SELECT af.id, af.path, af.media_revision, af.size, af.file_mtime_ns
		FROM audio_files af
		LEFT JOIN waveform_cache wc ON wc.audio_file_id = af.id
		WHERE wc.id IS NULL AND af.deleted = 0 AND af.file_mtime_ns IS NOT NULL
		ORDER BY af.downloaded_at DESC NULLS LAST, af.id DESC
	`)
	if err != nil {
		return fmt.Errorf("waveform query: %w", err)
	}

	type fileRow struct {
		id                      int64
		path                    string
		revision, size, mtimeNS int64
	}
	var files []fileRow
	defer func() {
		if failed.Load() > 0 {
			s.Errors.Report("worker", ErrorEvent{Operation: "waveform", Stage: "run", Cause: "partial-failure", Outcome: "degraded", FailedItems: int(failed.Load()), AttemptedItems: int(attempted.Load()), Context: examples.Context()})
		}
	}()
	for rows.Next() {
		var f fileRow
		if err := rows.Scan(&f.id, &f.path, &f.revision, &f.size, &f.mtimeNS); err != nil {
			examples.Add("scan", "", err)
			failed.Add(1)
			continue
		}
		files = append(files, f)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()

	log.Printf("Waveform: %d files pending, workers=%d", len(files), s.workers)

	sem := make(chan struct{}, s.workers)
	var wg sync.WaitGroup

	nextLog := start.Add(15 * time.Minute)

dispatch:
	for i, f := range files {
		if time.Since(start) >= maxDuration {
			log.Printf("Waveform: max duration reached after dispatching %d files", i)
			break
		}

		if now := time.Now(); now.After(nextLog) {
			log.Printf("Waveform: progress %d/%d dispatched, %d stored, elapsed %v",
				i, len(files), processed.Load(), now.Sub(start).Round(time.Second))
			nextLog = now.Add(15 * time.Minute)
		}

		select {
		case <-ctx.Done():
			break dispatch
		case sem <- struct{}{}:
		}
		wg.Add(1)
		attempted.Add(1)
		go func(f fileRow) {
			defer wg.Done()
			defer func() { <-sem }()

			fullPath, valid := s.resolvePath(f.path)
			if !valid {
				examples.Add("resolve", f.path, fmt.Errorf("invalid media path"))
				failed.Add(1)
				return
			}

			peaks, duration, err := generateWaveform(ctx, fullPath)
			if err != nil {
				log.Printf("Waveform: failed %s: %v", f.path, err)
				if ctx.Err() == nil {
					examples.Add("generate", f.path, err)
					failed.Add(1)
				}
				return
			}
			probeCtx, cancelProbe := context.WithTimeout(ctx, chapterProbeTimeout)
			chapters, chapterErr := probeChapters(probeCtx, fullPath)
			cancelProbe()
			if chapterErr != nil {
				// Chapters are optional: the waveform is still stored and the probe is retried by backfill.
				// The issue is recorded only once the row is stored so a file never counts twice in one run.
				log.Printf("Waveform: chapters unavailable for %s: %v", f.path, chapterErr)
				chapters = nil
			}

			statCtx, cancelStat := context.WithTimeout(ctx, MediaPreparationTimeout)
			info, err := s.fs.StatMedia(statCtx, fullPath)
			cancelStat()
			if err != nil {
				log.Printf("Waveform: failed to validate %s: %v", f.path, err)
				if ctx.Err() == nil {
					examples.Add("stat", f.path, err)
					failed.Add(1)
				}
				return
			}
			if info.Size() != f.size || info.ModTime().UnixNano() != f.mtimeNS {
				log.Printf("Waveform: file changed while generating %s; retry after indexing", f.path)
				examples.Add("validate", f.path, fmt.Errorf("file changed during generation; reindex before retrying"))
				failed.Add(1)
				return
			}
			encoded := base64.StdEncoding.EncodeToString(peaks)
			result, err := storeWaveform(ctx, conn, f.id, f.revision, encoded, duration, chapters)
			if err != nil {
				cancel(fmt.Errorf("waveform store %s: %w", f.path, err))
				return
			}
			stored, err := result.RowsAffected()
			if err != nil {
				cancel(fmt.Errorf("waveform store result %s: %w", f.path, err))
				return
			}
			if stored == 0 {
				examples.Add("store", f.path, fmt.Errorf("media changed or was deleted during generation; waveform discarded"))
				failed.Add(1)
				return
			}
			processed.Add(stored)
			if chapterErr != nil && ctx.Err() == nil {
				examples.Add("chapters", f.path, chapterErr)
				failed.Add(1)
			}
		}(f)
	}

	wg.Wait()
	log.Printf("Waveform: job done — processed %d files in %v", processed.Load(), time.Since(start).Round(time.Second))
	if context.Cause(ctx) == nil && time.Since(start) < maxDuration {
		if err := s.backfillChapters(ctx, conn, start.Add(maxDuration), &examples, &attempted, &processed, &failed); err != nil {
			cancel(err)
		}
	}
	return context.Cause(ctx)
}

// backfillChapters probes files whose waveform predates chapter support (or whose
// earlier probe failed). It never regenerates peaks. Probes count toward the job's
// attempted/processed totals like waveform generation does.
func (s *WaveformService) backfillChapters(ctx context.Context, conn *sql.Conn, deadline time.Time, examples *FailureExamples, attempted, processed, failed *atomic.Int64) error {
	rows, err := conn.QueryContext(ctx, `
		SELECT af.id, af.path, af.media_revision
		FROM waveform_cache wc
		JOIN audio_files af ON af.id = wc.audio_file_id
		WHERE wc.chapters IS NULL AND af.deleted = 0
			AND (wc.chapters_probed_at IS NULL OR wc.chapters_probed_at < NOW() - $1::interval)
		ORDER BY af.downloaded_at DESC NULLS LAST, af.id DESC
	`, chapterRetryInterval.String())
	if err != nil {
		return fmt.Errorf("chapters query: %w", err)
	}
	type fileRow struct {
		id, revision int64
		path         string
	}
	var files []fileRow
	for rows.Next() {
		var f fileRow
		if err := rows.Scan(&f.id, &f.path, &f.revision); err != nil {
			rows.Close()
			return err
		}
		files = append(files, f)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	if len(files) == 0 {
		return nil
	}
	log.Printf("Waveform: %d files pending chapter probe", len(files))

	// A store failure cancels the remaining probes immediately instead of after the whole backlog.
	bctx, cancel := context.WithCancelCause(ctx)
	defer cancel(nil)

	type probed struct {
		fileRow
		chapters []Chapter // nil when the probe failed
		err      error
	}
	results := make(chan probed, s.workers)
	sem := make(chan struct{}, s.workers)
	var wg sync.WaitGroup
	go func() {
		defer close(results)
	dispatch:
		for _, f := range files {
			select {
			case <-bctx.Done():
				break dispatch
			case sem <- struct{}{}:
			}
			// Re-check after waiting for a slot so nothing starts past the budget.
			remaining := time.Until(deadline)
			if remaining <= 0 {
				<-sem
				log.Printf("Waveform: max duration reached during chapter backfill")
				break dispatch
			}
			wg.Add(1)
			attempted.Add(1)
			go func(f fileRow) {
				defer wg.Done()
				defer func() { <-sem }()
				// Every failure goes through the consumer so the attempt is stamped and backed off.
				var chapters []Chapter
				fullPath, valid := s.resolvePath(f.path)
				err := fmt.Errorf("invalid media path")
				if valid {
					probeCtx, cancelProbe := context.WithTimeout(bctx, chapterProbeTimeout)
					chapters, err = probeChapters(probeCtx, fullPath)
					cancelProbe()
				}
				if err != nil {
					if bctx.Err() != nil {
						return
					}
					log.Printf("Waveform: chapter probe failed %s: %v", f.path, err)
					chapters = nil
				}
				select {
				case results <- probed{f, chapters, err}:
				case <-bctx.Done():
				}
			}(f)
		}
		wg.Wait()
	}()

	var stored int64
	// Drain fully so every worker can exit even after a store failure.
	for r := range results {
		if bctx.Err() != nil {
			continue
		}
		// A failed probe leaves chapters NULL but stamps the attempt so it is retried with backoff.
		result, err := conn.ExecContext(bctx, `
			UPDATE waveform_cache wc SET chapters = $2::jsonb, chapters_probed_at = NOW()
			FROM audio_files af
			WHERE wc.audio_file_id = $1 AND af.id = wc.audio_file_id AND af.media_revision = $3 AND wc.chapters IS NULL
		`, r.id, encodeChapters(r.chapters), r.revision)
		if err != nil {
			cancel(fmt.Errorf("chapters store %s: %w", r.path, err))
			continue
		}
		n, err := result.RowsAffected()
		if err != nil {
			cancel(fmt.Errorf("chapters store result %s: %w", r.path, err))
			continue
		}
		if r.err != nil {
			examples.Add("chapters", r.path, r.err)
			failed.Add(1)
			continue
		}
		if n == 0 {
			examples.Add("chapters", r.path, fmt.Errorf("media changed during probe; chapters discarded"))
			failed.Add(1)
			continue
		}
		stored += n
		processed.Add(n)
	}
	log.Printf("Waveform: chapter backfill stored %d/%d", stored, len(files))
	return context.Cause(bctx)
}

// Chapter is an embedded chapter marker as reported by ffprobe.
type Chapter struct {
	Title string  `json:"title"`
	Start float64 `json:"start"`
	End   float64 `json:"end"`
}

func probeChapters(ctx context.Context, filePath string) ([]Chapter, error) {
	cmd := exec.CommandContext(ctx, "ffprobe",
		"-v", "error",
		"-show_chapters",
		"-of", "json",
		filePath,
	)
	stderr := &limitedBuffer{limit: 2048}
	cmd.Stderr = stderr
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("ffprobe chapters: %w: %s", err, stderr.String())
	}
	return parseChapters(out)
}

func parseChapters(probe []byte) ([]Chapter, error) {
	var payload struct {
		Chapters []struct {
			Start string            `json:"start_time"`
			End   string            `json:"end_time"`
			Tags  map[string]string `json:"tags"`
		} `json:"chapters"`
	}
	if err := json.Unmarshal(probe, &payload); err != nil {
		return nil, fmt.Errorf("ffprobe chapters: %w", err)
	}
	chapters := make([]Chapter, 0, len(payload.Chapters))
	for _, raw := range payload.Chapters {
		start, err := strconv.ParseFloat(raw.Start, 64)
		if err != nil || start < 0 {
			continue
		}
		end, err := strconv.ParseFloat(raw.End, 64)
		if err != nil || end <= start {
			continue
		}
		chapters = append(chapters, Chapter{Title: strings.TrimSpace(raw.Tags["title"]), Start: start, End: end})
	}
	sort.SliceStable(chapters, func(i, j int) bool { return chapters[i].Start < chapters[j].Start })
	// Untitled chapters are numbered in display order.
	for i := range chapters {
		if chapters[i].Title == "" {
			chapters[i].Title = fmt.Sprintf("Chapter %d", i+1)
		}
	}
	return chapters, nil
}

// encodeChapters maps a successful probe to a JSON array (possibly empty) and a
// failed or absent probe (nil) to SQL NULL so the backfill retries it later.
func encodeChapters(chapters []Chapter) any {
	if chapters == nil {
		return nil
	}
	body, err := json.Marshal(chapters)
	if err != nil {
		return nil
	}
	return string(body)
}

func (s *WaveformService) resolvePath(virtualPath string) (string, bool) {
	parts := strings.SplitN(virtualPath, "/", 2)
	if len(parts) < 2 {
		return "", false
	}
	return s.fs.ValidatePath(parts[0], parts[1])
}

func getAudioDuration(ctx context.Context, filePath string) (float64, error) {
	cmd := exec.CommandContext(ctx, "ffprobe",
		"-v", "error",
		"-show_entries", "format=duration",
		"-of", "csv=p=0",
		filePath,
	)
	stderr := &limitedBuffer{limit: 2048}
	cmd.Stderr = stderr
	out, err := cmd.Output()
	if err != nil {
		return 0, fmt.Errorf("%w: %s", err, stderr.String())
	}
	return strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
}

func generateWaveform(ctx context.Context, filePath string) ([]byte, float64, error) {
	duration, err := getAudioDuration(ctx, filePath)
	if err != nil {
		return nil, 0, fmt.Errorf("ffprobe: %w", err)
	}
	if duration <= 0 {
		return nil, 0, fmt.Errorf("invalid duration: %f", duration)
	}

	totalSamples := int(duration * waveformSampleRate)
	samplesPerPeak := totalSamples / waveformNumPeaks
	if samplesPerPeak < 1 {
		samplesPerPeak = 1
	}

	cmd := exec.CommandContext(ctx, "ffmpeg",
		"-v", "error",
		"-i", filePath,
		"-af", fmt.Sprintf("aformat=channel_layouts=mono,aresample=%d", waveformSampleRate),
		"-f", "s16le",
		"-ac", "1",
		"pipe:1",
	)
	stderr := &limitedBuffer{limit: 2048}
	cmd.Stderr = stderr

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, 0, err
	}
	if err := cmd.Start(); err != nil {
		return nil, 0, err
	}

	rawPeaks := make([]float64, waveformNumPeaks)
	peakIdx := 0
	var sumSq float64
	var samplesInBucket int

	buf := make([]byte, 8192)
	var pending []byte

	for {
		n, readErr := stdout.Read(buf)
		if n > 0 {
			chunk := append(pending, buf[:n]...)
			pending = nil

			i := 0
			for i+1 < len(chunk) {
				sample := int16(binary.LittleEndian.Uint16(chunk[i : i+2]))
				i += 2

				f := float64(sample) / 32768.0
				sumSq += f * f
				samplesInBucket++

				if samplesInBucket >= samplesPerPeak && peakIdx < waveformNumPeaks {
					rawPeaks[peakIdx] = math.Sqrt(sumSq / float64(samplesInBucket))
					peakIdx++
					sumSq = 0
					samplesInBucket = 0
				}
			}
			if i < len(chunk) {
				pending = []byte{chunk[i]}
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			cmd.Process.Kill()
			cmd.Wait()
			return nil, 0, readErr
		}
	}

	if err := cmd.Wait(); err != nil && peakIdx < waveformNumPeaks/2 {
		return nil, 0, fmt.Errorf("ffmpeg: %w: %s", err, stderr.String())
	}

	if samplesInBucket > 0 && peakIdx < waveformNumPeaks {
		rawPeaks[peakIdx] = math.Sqrt(sumSq / float64(samplesInBucket))
		peakIdx++
	}

	dbPeaks := make([]float64, peakIdx)
	for i, v := range rawPeaks[:peakIdx] {
		if v > 0 {
			db := 20 * math.Log10(v)
			if db < waveformMinDB {
				db = waveformMinDB
			}
			dbPeaks[i] = db - waveformMinDB
		} else {
			dbPeaks[i] = 0
		}
	}

	dbPeaks = smoothPeaks(dbPeaks, 1)

	var maxDB float64
	for _, v := range dbPeaks {
		if v > maxDB {
			maxDB = v
		}
	}

	peaks := make([]byte, waveformNumPeaks)
	if maxDB > 0 {
		for i, v := range dbPeaks {
			peaks[i] = byte(math.Round(v / maxDB * 255))
		}
	}

	return peaks, duration, nil
}

func smoothPeaks(peaks []float64, radius int) []float64 {
	smoothed := make([]float64, len(peaks))
	for i := range peaks {
		start := max(0, i-radius)
		end := min(len(peaks)-1, i+radius)
		var sum float64
		for j := start; j <= end; j++ {
			sum += peaks[j]
		}
		smoothed[i] = sum / float64(end-start+1)
	}
	return smoothed
}

func storeWaveform(ctx context.Context, conn *sql.Conn, id, revision int64, peaks string, duration float64, chapters []Chapter) (sql.Result, error) {
	return conn.ExecContext(ctx, `
		WITH current_media AS (
			SELECT id FROM audio_files WHERE id = $1 AND media_revision = $4 AND deleted = 0 FOR UPDATE
		)
		INSERT INTO waveform_cache (audio_file_id, peaks, duration_seconds, chapters, chapters_probed_at)
		SELECT id, $2, $3, $5::jsonb, NOW() FROM current_media
		ON CONFLICT(audio_file_id) DO UPDATE SET peaks = excluded.peaks,
			duration_seconds = excluded.duration_seconds, chapters = excluded.chapters,
			chapters_probed_at = excluded.chapters_probed_at, generated_at = CURRENT_TIMESTAMP
	`, id, peaks, duration, revision, encodeChapters(chapters))
}
