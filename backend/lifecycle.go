package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/onion/audio-share-backend/config"
	"github.com/onion/audio-share-backend/services"
)

type lifecycle struct {
	mu                    sync.Mutex
	state                 string
	requests, media, jobs int
	check                 func(context.Context) error
	stop                  chan struct{}
	once                  sync.Once
}

func newLifecycle(check func(context.Context) error) *lifecycle {
	return &lifecycle{state: "running", check: check, stop: make(chan struct{})}
}

func (l *lifecycle) ready(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	l.mu.Lock()
	running := l.state == "running"
	l.mu.Unlock()
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if !running || l.check(ctx) != nil {
		http.Error(w, "Not ready", http.StatusServiceUnavailable)
		return
	}
	w.Write([]byte("OK"))
}

func (l *lifecycle) public(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/health", "/ready":
			if r.Method != http.MethodGet && r.Method != http.MethodHead {
				w.WriteHeader(http.StatusMethodNotAllowed)
				return
			}
			if r.URL.Path == "/ready" {
				l.ready(w, r)
			} else {
				w.Write([]byte("OK"))
			}
			return
		}
		l.mu.Lock()
		l.requests++
		l.mu.Unlock()
		defer func() { l.mu.Lock(); l.requests--; l.mu.Unlock() }()
		next.ServeHTTP(w, r)
	})
}

func (l *lifecycle) startMedia() func() {
	l.mu.Lock()
	l.media++
	l.mu.Unlock()
	return func() { l.mu.Lock(); l.media--; l.mu.Unlock() }
}

func (l *lifecycle) job(fn func()) func() {
	return func() {
		l.mu.Lock()
		if l.state != "running" {
			l.mu.Unlock()
			return
		}
		l.jobs++
		l.mu.Unlock()
		defer func() { l.mu.Lock(); l.jobs--; l.mu.Unlock() }()
		fn()
	}
}

func (l *lifecycle) management() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /ready", l.ready)
	mux.HandleFunc("GET /status", func(w http.ResponseWriter, r *http.Request) {
		l.mu.Lock()
		defer l.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		json.NewEncoder(w).Encode(struct {
			BuildID  string `json:"buildId"`
			State    string `json:"state"`
			Requests int    `json:"activeRequests"`
			Media    int    `json:"activeMediaResponses"`
			Jobs     int    `json:"activeJobs"`
		}{buildID, l.state, l.requests, l.media, l.jobs})
	})
	for _, action := range []string{"retire", "resume", "shutdown"} {
		mux.HandleFunc("POST /"+action, func(w http.ResponseWriter, r *http.Request) {
			l.mu.Lock()
			defer l.mu.Unlock()
			if l.state == "stopping" {
				http.Error(w, "Already stopping", http.StatusConflict)
				return
			}
			switch action {
			case "retire":
				l.state = "retiring"
			case "resume":
				l.state = "running"
			case "shutdown":
				l.state = "stopping"
				l.once.Do(func() { close(l.stop) })
			}
			w.WriteHeader(http.StatusAccepted)
		})
	}
	return mux
}

// Management remains available while public responses and background jobs drain.
// Request contexts are deliberately not derived from the termination context.
func serveUntilStopped(ctx context.Context, public net.Listener, handler http.Handler, management net.Listener, l *lifecycle, finishJobs func()) error {
	admin := &http.Server{Handler: l.management(), ReadHeaderTimeout: 5 * time.Second}
	web := &http.Server{Handler: handler, ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 60 * time.Second}
	errorsCh := make(chan error, 2)
	go func() { errorsCh <- admin.Serve(management) }()
	if public != nil {
		go func() { errorsCh <- web.Serve(public) }()
	}
	var serveErr error
	select {
	case <-ctx.Done():
	case <-l.stop:
	case serveErr = <-errorsCh:
	}
	l.mu.Lock()
	l.state = "stopping"
	l.mu.Unlock()
	if public != nil {
		// No deployment deadline: the orchestrator must not kill a live response.
		if err := web.Shutdown(context.Background()); err != nil {
			return err
		}
	}
	if finishJobs != nil {
		finishJobs()
	}
	if err := admin.Shutdown(context.Background()); err != nil {
		return err
	}
	if errors.Is(serveErr, http.ErrServerClosed) {
		return nil
	}
	return serveErr
}

func validateWebFiles(cfg *config.Config) error {
	index, err := os.ReadFile(filepath.Join(cfg.StaticDir, "index.html"))
	if err != nil {
		return fmt.Errorf("frontend index: %w", err)
	}
	if !strings.Contains(string(index), "<html") {
		return fmt.Errorf("frontend index is not HTML")
	}
	assets, err := os.ReadDir(filepath.Join(cfg.StaticDir, "assets"))
	if err != nil || len(assets) == 0 {
		return fmt.Errorf("frontend assets are missing or empty")
	}
	for _, match := range regexp.MustCompile(`(?:src|href)=["'](/assets/[^"'?#]+)`).FindAllSubmatch(index, -1) {
		asset, err := os.Open(filepath.Join(cfg.StaticDir, strings.TrimPrefix(string(match[1]), "/")))
		if err != nil {
			return fmt.Errorf("frontend entry asset: %w", err)
		}
		asset.Close()
	}
	return nil
}

func validateAudioMounts(fs *services.FileSystemService) error {
	for _, dir := range fs.GetSlugToDirectoryMap() {
		f, err := os.Open(dir.Path)
		if err != nil {
			return fmt.Errorf("audio mount %s: %w", dir.Path, err)
		}
		_, err = f.Readdirnames(1)
		f.Close()
		if err != nil && err != io.EOF {
			return fmt.Errorf("audio mount %s: %w", dir.Path, err)
		}
	}
	return nil
}
