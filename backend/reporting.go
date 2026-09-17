package main

import (
	"fmt"
	"time"

	"github.com/onion/audio-share-backend/config"
	"github.com/onion/audio-share-backend/services"
)

func configureErrorReporting(cfg *config.Config, db *services.Database) error {
	if cfg.NtfyErrorTopic == "" {
		return nil
	}
	policy := services.ErrorPolicy{
		BrowserCount: cfg.ErrorBrowserCount, BrowserSources: cfg.ErrorBrowserSources,
		ServerCount: cfg.ErrorServerCount, MutationCount: cfg.ErrorMutationCount, JobCount: cfg.ErrorJobCount,
	}
	for _, setting := range []struct {
		name, value string
		target      *time.Duration
	}{
		{"ERROR_REPORT_WINDOW", cfg.ErrorWindow, &policy.Window},
		{"ERROR_ALERT_COOLDOWN", cfg.ErrorCooldown, &policy.Cooldown},
		{"ERROR_REPORT_RETENTION", cfg.ErrorRetention, &policy.Retention},
	} {
		duration, err := time.ParseDuration(setting.value)
		if err != nil {
			return fmt.Errorf("invalid %s: %w", setting.name, err)
		}
		*setting.target = duration
	}
	if err := policy.Validate(); err != nil {
		return err
	}
	db.Errors = services.NewErrorReporter(db.DB(), buildID, policy, services.NewNtfyService(cfg.NtfyURL, cfg.NtfyErrorTopic, cfg.NtfyToken, 3, ""))
	return nil
}
