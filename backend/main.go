package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/onion/audio-share-backend/config"
	"github.com/onion/audio-share-backend/handlers"
	"github.com/onion/audio-share-backend/middleware"
	"github.com/onion/audio-share-backend/services"
)

var buildID = "development"

func sourceNormalizerFromConfig(cfg *config.Config) (*services.ScriptSourceNormalizer, error) {
	timeout, err := time.ParseDuration(cfg.SourceNormalizerTimeout)
	if err != nil || timeout <= 0 {
		return nil, fmt.Errorf("invalid SOURCE_NORMALIZER_TIMEOUT %q", cfg.SourceNormalizerTimeout)
	}
	return services.NewScriptSourceNormalizer(cfg.SourceNormalizerScript, timeout), nil
}

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	cfg := config.Load()
	command := "serve"
	if len(os.Args) > 1 {
		command = os.Args[1]
	}
	if command == "export-assets" {
		if len(os.Args) != 3 {
			return fmt.Errorf("usage: audio-share-backend export-assets DESTINATION")
		}
		return services.ExportAssets(cfg.StaticDir, os.Args[2])
	}
	switch command {
	case "serve", "worker", "migrate", "reindex", "waveform":
	default:
		return fmt.Errorf("unknown command %q (use serve, worker, migrate, reindex, waveform, export-assets)", command)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	startup, cancel := context.WithTimeout(ctx, 10*time.Second)
	db, err := services.OpenDatabase(startup, cfg.DatabaseURL)
	cancel()
	if err != nil {
		return fmt.Errorf("connect database: %w", err)
	}
	defer db.Close()
	if command == "migrate" {
		return db.Migrate(ctx)
	}
	startup, cancel = context.WithTimeout(ctx, 5*time.Second)
	err = db.CheckSchema(startup)
	cancel()
	if err != nil {
		return err
	}
	fsService := services.NewFileSystemService(cfg.AudioDir)
	if err := configureErrorReporting(cfg, db); err != nil {
		return err
	}
	if err := validateAudioMounts(fsService); err != nil {
		return err
	}
	webhookService := services.NewWebhookService(cfg.IndexWebhookURL, cfg.IndexWebhookToken)
	if command == "reindex" {
		return services.NewSearchService(db, fsService, webhookService).RebuildIndex()
	}
	if command == "waveform" {
		duration, err := time.ParseDuration(cfg.WaveformMaxDuration)
		if err != nil || duration <= 0 {
			return fmt.Errorf("invalid WAVEFORM_MAX_DURATION %q", cfg.WaveformMaxDuration)
		}
		waveforms := services.NewWaveformService(db.DB(), fsService, cfg.WaveformWorkers)
		waveforms.Errors = db.Errors
		return waveforms.RunJob(duration)
	}
	l := newLifecycle(db.CheckSchema)
	admin, err := net.Listen("tcp", cfg.ManagementAddr)
	if err != nil {
		return fmt.Errorf("management listener: %w", err)
	}
	defer admin.Close()
	if command == "worker" {
		finish, err := startWorker(cfg, db, fsService, l)
		if err != nil {
			return err
		}
		log.Printf("Worker started; management on %s", admin.Addr())
		return serveUntilStopped(ctx, nil, nil, admin, l, finish)
	}
	if err := validateWebFiles(cfg); err != nil {
		return err
	}
	handler, err := appHandler(cfg, db, fsService, l)
	if err != nil {
		return err
	}
	listener, err := net.Listen("tcp", ":"+cfg.Port)
	if err != nil {
		return err
	}
	defer listener.Close()
	log.Printf("Starting build %s on %s; management on %s", buildID, listener.Addr(), admin.Addr())
	return serveUntilStopped(ctx, listener, l.public(handler), admin, l, nil)
}

func appHandler(cfg *config.Config, db *services.Database, fsService *services.FileSystemService, l *lifecycle) (http.Handler, error) {
	webhookService := services.NewWebhookService(cfg.IndexWebhookURL, cfg.IndexWebhookToken)
	searchService := services.NewSearchService(db, fsService, webhookService)

	if cfg.SessionSecret == "" {
		return nil, fmt.Errorf("SESSION_SECRET is required but not set")
	}
	streamKeyTTL, err := time.ParseDuration(cfg.StreamKeyTTL)
	if err != nil || streamKeyTTL <= 0 {
		return nil, fmt.Errorf("Invalid STREAM_KEY_TTL %q", cfg.StreamKeyTTL)
	}
	downloadKeyTTL, err := time.ParseDuration(cfg.DownloadKeyTTL)
	if err != nil || downloadKeyTTL <= 0 {
		return nil, fmt.Errorf("Invalid DOWNLOAD_KEY_TTL %q", cfg.DownloadKeyTTL)
	}
	downloadSessionMinAge, err := time.ParseDuration(cfg.DownloadSessionMinAge)
	if err != nil || downloadSessionMinAge < 0 {
		return nil, fmt.Errorf("Invalid DOWNLOAD_SESSION_MIN_AGE %q", cfg.DownloadSessionMinAge)
	}
	accessKeys, err := services.NewAccessKeyManager(
		cfg.SessionSecret,
		cfg.StreamKeyLimits,
		cfg.DownloadKeyLimits,
		streamKeyTTL,
		downloadKeyTTL,
	)
	if err != nil {
		return nil, fmt.Errorf("Invalid audio access key configuration: %v", err)
	}
	if err := accessKeys.SetCaptchaPolicy(services.MediaPurposeStream, cfg.StreamCaptchaLimits); err != nil {
		return nil, fmt.Errorf("Invalid STREAM_CAPTCHA_LIMITS %q: %v", cfg.StreamCaptchaLimits, err)
	}
	captchaEnforcement := strings.ToLower(strings.TrimSpace(cfg.CapEnforcement))
	if captchaEnforcement != "off" && captchaEnforcement != "observe" && captchaEnforcement != "enforce" {
		return nil, fmt.Errorf("Invalid CAP_ENFORCEMENT %q", cfg.CapEnforcement)
	}
	downloadCaptchaMode := strings.ToLower(strings.TrimSpace(cfg.DownloadCaptchaMode))
	if downloadCaptchaMode != "off" && downloadCaptchaMode != "always" {
		return nil, fmt.Errorf("Invalid DOWNLOAD_CAPTCHA_MODE %q", cfg.DownloadCaptchaMode)
	}
	streamClearanceTTL, err := time.ParseDuration(cfg.StreamCaptchaClearanceTTL)
	if err != nil || streamClearanceTTL <= 0 {
		return nil, fmt.Errorf("Invalid STREAM_CAPTCHA_CLEARANCE_TTL %q", cfg.StreamCaptchaClearanceTTL)
	}
	capVerifyTimeout, err := time.ParseDuration(cfg.CapVerifyTimeout)
	if err != nil || capVerifyTimeout <= 0 {
		return nil, fmt.Errorf("Invalid CAP_VERIFY_TIMEOUT %q", cfg.CapVerifyTimeout)
	}
	var captchaVerifier services.CaptchaVerifier
	captchaConfigured := downloadCaptchaMode == "always" || cfg.StreamCaptchaLimits != ""
	if captchaEnforcement == "enforce" && captchaConfigured {
		if cfg.CapPublicEndpoint == "" {
			return nil, fmt.Errorf("CAP_PUBLIC_ENDPOINT is required when Cap enforcement is enabled")
		}
		verifier, err := services.NewCapVerifier(
			cfg.CapVerifyEndpoint,
			cfg.CapSecretKey,
			capVerifyTimeout,
		)
		if err != nil {
			return nil, fmt.Errorf("Invalid Cap verification configuration: %v", err)
		}
		captchaVerifier = verifier
	}
	var streamIPLimiter, downloadIPLimiter *services.IPBandwidthLimiter
	if cfg.StreamIPBytesPerSecond > 0 {
		streamIPLimiter = services.NewIPBandwidthLimiter(
			cfg.StreamIPBytesPerSecond,
			max(cfg.StreamIPBytesPerSecond, cfg.StreamBurstBytes),
		)
	}
	if cfg.DownloadIPBytesPerSecond > 0 {
		downloadIPLimiter = services.NewIPBandwidthLimiter(
			cfg.DownloadIPBytesPerSecond,
			max(cfg.DownloadIPBytesPerSecond, cfg.DownloadBurstBytes),
		)
	}

	ntfyService := services.NewNtfyService(cfg.NtfyURL, cfg.NtfyTopic, cfg.NtfyToken, cfg.NtfyPriority, cfg.NtfyReviewURL)
	playbackService := services.NewPlaybackService(db, streamKeyTTL)
	libraryService := services.NewLibraryService(db)
	requestsService := services.NewRequestsService(db)
	sourceNormalizer, err := sourceNormalizerFromConfig(cfg)
	if err != nil {
		return nil, err
	}
	rateLimiter := middleware.NewRateLimiter(cfg)

	audioHandler := handlers.NewAudioHandler(fsService, db.DB(), handlers.AudioHandlerOptions{
		OnMediaStart:           l.startMedia,
		StreamBytesPerSecond:   cfg.StreamBytesPerSecond,
		StreamBurstBytes:       cfg.StreamBurstBytes,
		DownloadBytesPerSecond: cfg.DownloadBytesPerSecond,
		DownloadBurstBytes:     cfg.DownloadBurstBytes,
		DownloadSessionMinAge:  downloadSessionMinAge,
		SessionSecret:          cfg.SessionSecret,
		AccessKeys:             accessKeys,
		AccessFailureLimiter:   rateLimiter,
		StreamIPLimiter:        streamIPLimiter,
		DownloadIPLimiter:      downloadIPLimiter,
		CaptchaVerifier:        captchaVerifier,
		CaptchaEnforcement:     captchaEnforcement,
		DownloadCaptchaMode:    downloadCaptchaMode,
		StreamClearanceTTL:     streamClearanceTTL,
	})
	folderHandler := handlers.NewFolderHandler(fsService, db.DB())
	browseHandler := handlers.NewBrowseHandler(searchService)
	shareHandler := handlers.NewShareHandler(ntfyService, requestsService, sourceNormalizer)
	contactHandler := handlers.NewContactHandler(ntfyService, cfg.SessionSecret)
	contentHandler := handlers.NewContentHandler(cfg.ContentDir, cfg.DefaultTitle, searchService)
	searchHandler := handlers.NewSearchHandler(searchService)
	playbackHandler := handlers.NewPlaybackHandler(playbackService, cfg.SessionSecret, accessKeys)
	libraryHandler := handlers.NewLibraryHandler(libraryService, cfg.SessionSecret)
	preferencesHandler := handlers.NewPreferencesHandler(cfg.SessionSecret)
	requestsHandler := handlers.NewRequestsHandler(requestsService)
	adminHandler := handlers.NewAdminHandler(db.DB(), requestsService)

	frontendConfig := handlers.FrontendConfig{
		DefaultTitle:       cfg.DefaultTitle,
		DefaultDescription: cfg.DefaultDescription,
		BannerMessage:      cfg.BannerMessage,
		BannerVariant:      cfg.BannerVariant,
		BannerLinkText:     cfg.BannerLinkText,
		BannerLinkURL:      cfg.BannerLinkURL,
		CapPublicEndpoint:  cfg.CapPublicEndpoint,
		BuildID:            buildID,
		ErrorReporting:     db.Errors != nil,
	}
	spaHandler := handlers.NewSPAHandler(
		cfg.StaticDir,
		frontendConfig,
		cfg.RybbitURL,
		cfg.RybbitSiteID,
		db.DB(),
		handlers.SPAHandlerOptions{
			ContentDir:      cfg.ContentDir,
			SearchService:   searchService,
			RequestsService: requestsService,
			SessionSecret:   cfg.SessionSecret,
		},
	)

	securityHeaders := middleware.NewSecurityHeaders(cfg.RybbitURL, cfg.CapPublicEndpoint)
	apiKeyAuth := middleware.NewAPIKeyAuth(cfg.RequestsAPIKey)
	if cfg.RequestsAPIKey == "" {
		log.Println("WARNING: REQUESTS_API_KEY is not set — write operations on /api/requests are disabled")
	}

	mux := http.NewServeMux()
	if db.Errors != nil {
		mux.Handle("/api/errors", handlers.NewErrorHandler(db.Errors, cfg.SessionSecret))
	}

	mux.HandleFunc("/api/version", spaHandler.VersionHandler())
	mux.Handle("/api/session", handlers.NewSessionBootstrapHandler(cfg.SessionSecret))
	mux.Handle("/api/session/targeted-message", handlers.NewTargetedMessageHandler(db.DB(), cfg.SessionSecret))
	mux.Handle("/api/audio/key/", audioHandler)
	mux.Handle("/api/folder/key/", folderHandler)
	mux.Handle("/api/browse", browseHandler)
	mux.Handle("/api/browse/", browseHandler)
	mux.Handle("/api/search", searchHandler)
	mux.HandleFunc("/api/audio/random", searchHandler.RandomHandler())
	mux.Handle("/api/share", shareHandler)
	mux.Handle("/api/contact", contactHandler)
	mux.HandleFunc("/api/about", contentHandler.AboutHandler())
	mux.HandleFunc("/api/stats", contentHandler.StatsHandler())
	mux.HandleFunc("/api/playback/record", playbackHandler.RecordHandler())
	mux.HandleFunc("/api/playback/recent", playbackHandler.RecentHandler())
	mux.HandleFunc("/api/playback/popular", playbackHandler.PopularHandler())
	mux.HandleFunc("/api/playback/new", playbackHandler.NewHandler())
	mux.HandleFunc("/api/playback/unavailable", playbackHandler.UnavailableHandler())
	mux.HandleFunc("/api/playback/recommendations/", playbackHandler.RecommendationsHandler())
	mux.HandleFunc("/api/preferences/mature-content", preferencesHandler.MatureContentHandler())
	mux.HandleFunc("/api/profile/recovery-key", libraryHandler.RecoveryKeyHandler())
	mux.HandleFunc("/api/profile/recover", libraryHandler.RecoverHandler())
	mux.HandleFunc("/api/likes", libraryHandler.LikesHandler())
	mux.HandleFunc("/api/likes/tracks", libraryHandler.LikedTracksHandler())
	mux.HandleFunc("/api/likes/", libraryHandler.LikeItemHandler())

	mux.Handle("/api/requests", requestsHandler)
	mux.Handle("/api/admin/", apiKeyAuth.Middleware(adminHandler))

	mux.HandleFunc("/sitemap.xml", contentHandler.SitemapHandler())
	mux.HandleFunc("/robots.txt", contentHandler.RobotsHandler())
	mux.HandleFunc("/site.webmanifest", contentHandler.ManifestHandler())

	mux.Handle("/", spaHandler)

	var handler http.Handler = mux
	if db.Errors != nil {
		handler = handlers.ReportHTTPErrors(db.Errors, handler)
	}
	return securityHeaders.Middleware(rateLimiter.Middleware(corsMiddleware(cfg.CORSOrigins, handler))), nil
}

func corsMiddleware(allowedOrigins []string, next http.Handler) http.Handler {
	allowed := make(map[string]bool, len(allowedOrigins))
	for _, o := range allowedOrigins {
		allowed[o] = true
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && allowed[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Range, X-API-Key, X-Request-ID")
			w.Header().Set("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length, Date, Retry-After, X-Error-Reporting")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
