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

	if len(os.Args) > 1 && os.Args[1] == "reindex" {
		db := services.NewDatabase(cfg.DBPath)
		defer db.Close()
		searchService := services.NewSearchService(db, fsService)
		if err := searchService.RebuildIndex(); err != nil {
			log.Fatalf("Reindex failed: %v", err)
		}
		os.Exit(0)
	}

	db := services.NewDatabase(cfg.DBPath)
	searchService := services.NewSearchService(db, fsService)

	if cfg.IndexSchedule != "" {
		searchService.StartScheduledReindex(cfg.IndexSchedule)
	}

	ntfyService := services.NewNtfyService(cfg.NtfyURL, cfg.NtfyTopic, cfg.NtfyToken, cfg.NtfyPriority)

	audioHandler := handlers.NewAudioHandler(fsService)
	browseHandler := handlers.NewBrowseHandler(fsService, searchService)
	shareHandler := handlers.NewShareHandler(ntfyService)
	contactHandler := handlers.NewContactHandler(ntfyService)
	contentHandler := handlers.NewContentHandler(cfg.ContentDir, cfg.DefaultTitle, searchService)
	searchHandler := handlers.NewSearchHandler(searchService)

	frontendConfig := handlers.FrontendConfig{
		DefaultTitle:       cfg.DefaultTitle,
		DefaultDescription: cfg.DefaultDescription,
		UmamiURL:           cfg.UmamiURL,
		UmamiWebsiteID:     cfg.UmamiWebsiteID,
	}
	spaHandler := handlers.NewSPAHandler(cfg.StaticDir, frontendConfig)

	rateLimiter := middleware.NewRateLimiter(cfg)
	securityHeaders := middleware.NewSecurityHeaders(cfg.UmamiURL)

	mux := http.NewServeMux()

	mux.Handle("/api/audio/", audioHandler)
	mux.Handle("/api/browse", browseHandler)
	mux.Handle("/api/browse/", browseHandler)
	mux.Handle("/api/search", searchHandler)
	mux.Handle("/api/share", shareHandler)
	mux.Handle("/api/contact", contactHandler)
	mux.HandleFunc("/api/about", contentHandler.AboutHandler())
	mux.HandleFunc("/api/stats", contentHandler.StatsHandler())

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
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Range")
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
