package main

import (
	"log"
	"net/http"
	"os"

	"github.com/onion/audio-share-backend/config"
	"github.com/onion/audio-share-backend/handlers"
	"github.com/onion/audio-share-backend/middleware"
	"github.com/onion/audio-share-backend/services"
)

func main() {
	cfg := config.Load()

	fsService := services.NewFileSystemService(cfg.AudioDir)
	webhookService := services.NewWebhookService(cfg.IndexWebhookURL, cfg.IndexWebhookToken)

	if len(os.Args) > 1 && os.Args[1] == "reindex" {
		db := services.NewDatabase(cfg.DBPath)
		defer db.Close()
		searchService := services.NewSearchService(db, fsService, webhookService)
		if err := searchService.RebuildIndex(); err != nil {
			log.Fatalf("Reindex failed: %v", err)
		}
		os.Exit(0)
	}

	db := services.NewDatabase(cfg.DBPath)
	searchService := services.NewSearchService(db, fsService, webhookService)

	if cfg.IndexSchedule != "" {
		searchService.StartScheduledReindex(cfg.IndexSchedule)
	}

	ntfyService := services.NewNtfyService(cfg.NtfyURL, cfg.NtfyTopic, cfg.NtfyToken, cfg.NtfyPriority)
	playbackService := services.NewPlaybackService(db)
	requestsService := services.NewRequestsService(db)

	audioHandler := handlers.NewAudioHandler(fsService, db.DB())
	folderHandler := handlers.NewFolderHandler(fsService, db.DB())
	browseHandler := handlers.NewBrowseHandler(searchService)
	shareHandler := handlers.NewShareHandler(ntfyService)
	contactHandler := handlers.NewContactHandler(ntfyService)
	contentHandler := handlers.NewContentHandler(cfg.ContentDir, cfg.DefaultTitle, searchService)
	searchHandler := handlers.NewSearchHandler(searchService)
	playbackHandler := handlers.NewPlaybackHandler(playbackService)
	requestsHandler := handlers.NewRequestsHandler(requestsService)

	frontendConfig := handlers.FrontendConfig{
		DefaultTitle:       cfg.DefaultTitle,
		DefaultDescription: cfg.DefaultDescription,
		UmamiURL:           cfg.UmamiURL,
		UmamiWebsiteID:     cfg.UmamiWebsiteID,
	}
	spaHandler := handlers.NewSPAHandler(cfg.StaticDir, frontendConfig)

	rateLimiter := middleware.NewRateLimiter(cfg)
	securityHeaders := middleware.NewSecurityHeaders(cfg.UmamiURL)
	apiKeyAuth := middleware.NewAPIKeyAuth(cfg.RequestsAPIKey)

	mux := http.NewServeMux()

	mux.Handle("/api/audio/key/", audioHandler)
	mux.Handle("/api/folder/key/", folderHandler)
	mux.Handle("/api/browse", browseHandler)
	mux.Handle("/api/browse/", browseHandler)
	mux.Handle("/api/search", searchHandler)
	mux.Handle("/api/share", shareHandler)
	mux.Handle("/api/contact", contactHandler)
	mux.HandleFunc("/api/about", contentHandler.AboutHandler())
	mux.HandleFunc("/api/stats", contentHandler.StatsHandler())
	mux.HandleFunc("/api/playback/record", playbackHandler.RecordHandler())
	mux.HandleFunc("/api/playback/recent", playbackHandler.RecentHandler())
	mux.HandleFunc("/api/playback/popular", playbackHandler.PopularHandler())
	mux.HandleFunc("/api/playback/new", playbackHandler.NewHandler())

	mux.Handle("/api/requests", apiKeyAuth.Middleware(requestsHandler))
	mux.Handle("/api/requests/", apiKeyAuth.Middleware(requestsHandler))

	mux.HandleFunc("/sitemap.xml", contentHandler.SitemapHandler())
	mux.HandleFunc("/site.webmanifest", contentHandler.ManifestHandler())

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	mux.Handle("/", spaHandler)

	handler := securityHeaders.Middleware(rateLimiter.Middleware(corsMiddleware(mux)))

	log.Printf("Starting server on :%s", cfg.Port)
	log.Printf("Audio directories: %v", fsService.GetSlugToDirectoryMap())
	log.Printf("Content directory: %s", cfg.ContentDir)
	log.Printf("Static directory: %s", cfg.StaticDir)

	if err := http.ListenAndServe(":"+cfg.Port, handler); err != nil {
		log.Fatal(err)
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Range, X-API-Key")
			w.Header().Set("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
