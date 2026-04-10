package services

import (
	"database/sql"
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"io"
	"log"
	"math"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/robfig/cron/v3"
)

const waveformNumPeaks = 500
const waveformSampleRate = 8000
const waveformMinDB = -52.0

type WaveformService struct {
	db      *sql.DB
	fs      *FileSystemService
	workers int
	mu      sync.Mutex // guards running flag
	running bool
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

func (s *WaveformService) StartScheduledJob(cronExpr, maxDurationStr string) {
	maxDuration, err := time.ParseDuration(maxDurationStr)
	if err != nil {
		log.Printf("Waveform: invalid WAVEFORM_MAX_DURATION %q: %v, defaulting to 2h", maxDurationStr, err)
		maxDuration = 2 * time.Hour
	}

	log.Printf("Waveform: scheduling job cron=%q maxDuration=%v", cronExpr, maxDuration)

	c := cron.New()
	_, err = c.AddFunc(cronExpr, func() {
		s.mu.Lock()
		if s.running {
			s.mu.Unlock()
			log.Println("Waveform: job already running, skipping")
			return
		}
		s.running = true
		s.mu.Unlock()

		defer func() {
			s.mu.Lock()
			s.running = false
			s.mu.Unlock()
		}()

		s.RunJob(maxDuration)
	})
	if err != nil {
		log.Printf("Waveform: error setting up schedule: %v", err)
		return
	}
	c.Start()
}

func (s *WaveformService) RunJob(maxDuration time.Duration) {
	start := time.Now()
	log.Println("Waveform: starting generation job")

	rows, err := s.db.Query(`
		SELECT af.id, af.path
		FROM audio_files af
		LEFT JOIN waveform_cache wc ON wc.audio_file_id = af.id
		WHERE wc.id IS NULL AND af.deleted = 0
		ORDER BY af.downloaded_at DESC NULLS LAST, af.id DESC
	`)
	if err != nil {
		log.Printf("Waveform: query error: %v", err)
		return
	}

	type fileRow struct {
		id   int64
		path string
	}
	var files []fileRow
	for rows.Next() {
		var f fileRow
		if err := rows.Scan(&f.id, &f.path); err != nil {
			continue
		}
		files = append(files, f)
	}
	rows.Close()

	log.Printf("Waveform: %d files pending, workers=%d", len(files), s.workers)

	var processed atomic.Int64
	sem := make(chan struct{}, s.workers)
	var wg sync.WaitGroup

	nextLog := start.Add(15 * time.Minute)

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

		sem <- struct{}{}
		wg.Add(1)
		go func(f fileRow) {
			defer wg.Done()
			defer func() { <-sem }()

			fullPath, valid := s.resolvePath(f.path)
			if !valid {
				return
			}

			peaks, duration, err := generateWaveform(fullPath)
			if err != nil {
				log.Printf("Waveform: failed %s: %v", f.path, err)
				return
			}

			encoded := base64.StdEncoding.EncodeToString(peaks)
			_, err = s.db.Exec(`
				INSERT INTO waveform_cache (audio_file_id, peaks, duration_seconds) VALUES ($1, $2, $3)
				ON CONFLICT(audio_file_id) DO UPDATE SET peaks = excluded.peaks, duration_seconds = excluded.duration_seconds, generated_at = CURRENT_TIMESTAMP
			`, f.id, encoded, duration)
			if err != nil {
				log.Printf("Waveform: store error %s: %v", f.path, err)
				return
			}
			processed.Add(1)
		}(f)
	}

	wg.Wait()
	log.Printf("Waveform: job done — processed %d files in %v", processed.Load(), time.Since(start).Round(time.Second))
}

func (s *WaveformService) resolvePath(virtualPath string) (string, bool) {
	parts := strings.SplitN(virtualPath, "/", 2)
	if len(parts) < 2 {
		return "", false
	}
	return s.fs.ValidatePath(parts[0], parts[1])
}

func getAudioDuration(filePath string) (float64, error) {
	cmd := exec.Command("ffprobe",
		"-v", "quiet",
		"-show_entries", "format=duration",
		"-of", "csv=p=0",
		filePath,
	)
	out, err := cmd.Output()
	if err != nil {
		return 0, err
	}
	return strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
}

func generateWaveform(filePath string) ([]byte, float64, error) {
	duration, err := getAudioDuration(filePath)
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

	cmd := exec.Command("ffmpeg",
		"-i", filePath,
		"-af", fmt.Sprintf("aformat=channel_layouts=mono,aresample=%d", waveformSampleRate),
		"-f", "s16le",
		"-ac", "1",
		"pipe:1",
	)
	cmd.Stderr = io.Discard

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
		return nil, 0, fmt.Errorf("ffmpeg: %w", err)
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
