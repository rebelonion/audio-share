package main

import (
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/onion/audio-share-backend/config"
	"github.com/onion/audio-share-backend/handlers"
	"github.com/onion/audio-share-backend/middleware"
	"github.com/onion/audio-share-backend/services"
)

var buildID = "development"

func main() {
	cfg := config.Load()

	fsService := services.NewFileSystemService(cfg.AudioDir)
	webhookService := services.NewWebhookService(cfg.IndexWebhookURL, cfg.IndexWebhookToken)

	if len(os.Args) > 1 && os.Args[1] == "reindex" {
		db := services.NewDatabase(cfg.DatabaseURL)
		defer db.Close()
		searchService := services.NewSearchService(db, fsService, webhookService)
		if err := searchService.RebuildIndex(); err != nil {
			log.Fatalf("Reindex failed: %v", err)
		}
		os.Exit(0)
	}

	if len(os.Args) > 1 && os.Args[1] == "waveform" {
		db := services.NewDatabase(cfg.DatabaseURL)
		defer db.Close()
		waveformService := services.NewWaveformService(db.DB(), fsService, cfg.WaveformWorkers)
		maxDuration, err := time.ParseDuration(cfg.WaveformMaxDuration)
		if err != nil {
			maxDuration = 2 * time.Hour
		}
		waveformService.RunJob(maxDuration)
		os.Exit(0)
	}

	db := services.NewDatabase(cfg.DatabaseURL)
	searchService := services.NewSearchService(db, fsService, webhookService)

	if cfg.IndexSchedule != "" {
		searchService.StartScheduledReindex(cfg.IndexSchedule)
	}

	if cfg.WaveformCron != "" {
		waveformService := services.NewWaveformService(db.DB(), fsService, cfg.WaveformWorkers)
		waveformService.StartScheduledJob(cfg.WaveformCron, cfg.WaveformMaxDuration)
	}

	if cfg.SessionSecret == "" {
		log.Fatal("SESSION_SECRET is required but not set")
	}
	streamKeyTTL, err := time.ParseDuration(cfg.StreamKeyTTL)
	if err != nil || streamKeyTTL <= 0 {
		log.Fatalf("Invalid STREAM_KEY_TTL %q", cfg.StreamKeyTTL)
	}
	downloadKeyTTL, err := time.ParseDuration(cfg.DownloadKeyTTL)
	if err != nil || downloadKeyTTL <= 0 {
		log.Fatalf("Invalid DOWNLOAD_KEY_TTL %q", cfg.DownloadKeyTTL)
	}
	downloadSessionMinAge, err := time.ParseDuration(cfg.DownloadSessionMinAge)
	if err != nil || downloadSessionMinAge < 0 {
		log.Fatalf("Invalid DOWNLOAD_SESSION_MIN_AGE %q", cfg.DownloadSessionMinAge)
	}
	accessKeys, err := services.NewAccessKeyManager(
		cfg.SessionSecret,
		cfg.StreamKeyLimits,
		cfg.DownloadKeyLimits,
		streamKeyTTL,
		downloadKeyTTL,
	)
	if err != nil {
		log.Fatalf("Invalid audio access key configuration: %v", err)
	}
	if err := accessKeys.SetCaptchaPolicy(services.MediaPurposeStream, cfg.StreamCaptchaLimits); err != nil {
		log.Fatalf("Invalid STREAM_CAPTCHA_LIMITS %q: %v", cfg.StreamCaptchaLimits, err)
	}
	captchaEnforcement := strings.ToLower(strings.TrimSpace(cfg.CapEnforcement))
	if captchaEnforcement != "off" && captchaEnforcement != "observe" && captchaEnforcement != "enforce" {
		log.Fatalf("Invalid CAP_ENFORCEMENT %q", cfg.CapEnforcement)
	}
	downloadCaptchaMode := strings.ToLower(strings.TrimSpace(cfg.DownloadCaptchaMode))
	if downloadCaptchaMode != "off" && downloadCaptchaMode != "always" {
		log.Fatalf("Invalid DOWNLOAD_CAPTCHA_MODE %q", cfg.DownloadCaptchaMode)
	}
	streamClearanceTTL, err := time.ParseDuration(cfg.StreamCaptchaClearanceTTL)
	if err != nil || streamClearanceTTL <= 0 {
		log.Fatalf("Invalid STREAM_CAPTCHA_CLEARANCE_TTL %q", cfg.StreamCaptchaClearanceTTL)
	}
	capVerifyTimeout, err := time.ParseDuration(cfg.CapVerifyTimeout)
	if err != nil || capVerifyTimeout <= 0 {
		log.Fatalf("Invalid CAP_VERIFY_TIMEOUT %q", cfg.CapVerifyTimeout)
	}
	var captchaVerifier services.CaptchaVerifier
	captchaConfigured := downloadCaptchaMode == "always" || cfg.StreamCaptchaLimits != ""
	if captchaEnforcement == "enforce" && captchaConfigured {
		if cfg.CapPublicEndpoint == "" {
			log.Fatal("CAP_PUBLIC_ENDPOINT is required when Cap enforcement is enabled")
		}
		verifier, err := services.NewCapVerifier(
			cfg.CapVerifyEndpoint,
			cfg.CapSecretKey,
			capVerifyTimeout,
		)
		if err != nil {
			log.Fatalf("Invalid Cap verification configuration: %v", err)
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
	playbackService.StartAccessKeyClaimCleanup()
	libraryService := services.NewLibraryService(db)
	requestsService := services.NewRequestsService(db)
	rateLimiter := middleware.NewRateLimiter(cfg)

	audioHandler := handlers.NewAudioHandler(fsService, db.DB(), handlers.AudioHandlerOptions{
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
	shareHandler := handlers.NewShareHandler(ntfyService)
	contactHandler := handlers.NewContactHandler(ntfyService)
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
	}
	spaHandler := handlers.NewSPAHandler(cfg.StaticDir, frontendConfig, cfg.RybbitURL, cfg.RybbitSiteID, db.DB())

	securityHeaders := middleware.NewSecurityHeaders(cfg.RybbitURL, cfg.CapPublicEndpoint)
	apiKeyAuth := middleware.NewAPIKeyAuth(cfg.RequestsAPIKey)
	if cfg.RequestsAPIKey == "" {
		log.Println("WARNING: REQUESTS_API_KEY is not set — write operations on /api/requests are disabled")
	}

	mux := http.NewServeMux()

	mux.HandleFunc("/api/version", spaHandler.VersionHandler())
	mux.Handle("/api/session", handlers.NewSessionBootstrapHandler(cfg.SessionSecret))
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

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	mux.Handle("/", spaHandler)

	handler := securityHeaders.Middleware(rateLimiter.Middleware(corsMiddleware(cfg.CORSOrigins, mux)))

	log.Printf("Starting server on :%s", cfg.Port)
	log.Printf("Audio directories: %v", fsService.GetSlugToDirectoryMap())
	log.Printf("Content directory: %s", cfg.ContentDir)
	log.Printf("Static directory: %s", cfg.StaticDir)
	log.Printf("Build ID: %s", buildID)

	if err := http.ListenAndServe(":"+cfg.Port, handler); err != nil {
		log.Fatal(err)
	}
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
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Range, X-API-Key")
			w.Header().Set("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length, Date, Retry-After")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
