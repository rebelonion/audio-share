package main

import (
	"fmt"
	"log"
	"time"

	"github.com/onion/audio-share-backend/config"
	"github.com/onion/audio-share-backend/services"
	"github.com/robfig/cron/v3"
)

func startWorker(cfg *config.Config, db *services.Database, fs *services.FileSystemService, l *lifecycle) (func(), error) {
	ttl, err := time.ParseDuration(cfg.StreamKeyTTL)
	if err != nil || ttl <= 0 {
		return nil, fmt.Errorf("invalid STREAM_KEY_TTL %q", cfg.StreamKeyTTL)
	}
	maxDuration, err := time.ParseDuration(cfg.WaveformMaxDuration)
	if err != nil || maxDuration <= 0 {
		return nil, fmt.Errorf("invalid WAVEFORM_MAX_DURATION %q", cfg.WaveformMaxDuration)
	}
	search := services.NewSearchService(db, fs, services.NewWebhookService(cfg.IndexWebhookURL, cfg.IndexWebhookToken))
	waveforms := services.NewWaveformService(db.DB(), fs, cfg.WaveformWorkers)
	waveforms.Errors = db.Errors
	playback := services.NewPlaybackService(db, ttl)
	scheduler := cron.New(cron.WithChain(cron.SkipIfStillRunning(cron.DefaultLogger)))
	for _, job := range []struct {
		name, schedule string
		run            func() error
	}{
		{"reindex", cfg.IndexSchedule, search.RebuildIndex},
		{"waveform", cfg.WaveformCron, func() error { return waveforms.RunJob(maxDuration) }},
		{"playback-cleanup", "@every 15m", playback.CleanupAccessKeyClaims},
		{"error-alerts", "@every 30s", db.Errors.Process},
	} {
		if job.schedule == "" {
			continue
		}
		_, err := scheduler.AddFunc(job.schedule, l.job(func() {
			if err := job.run(); err != nil {
				log.Printf("Worker %s: %v", job.name, err)
				if job.name == "playback-cleanup" {
					db.Errors.Report("worker", services.ErrorEvent{Operation: job.name, Stage: "run", Cause: "unexpected", Outcome: "blocked"})
				}
			}
		}))
		if err != nil {
			return nil, err
		}
	}
	scheduler.Start()
	return func() { <-scheduler.Stop().Done() }, nil
}
