package handlers

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net"
	"net/http"
	"regexp"
	"runtime/debug"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/onion/audio-share-backend/services"
)

type ErrorRecorder interface {
	Record(context.Context, string, string, services.ErrorEvent) error
}

// Limits are separate from user API limits; a reporting storm must not prevent
// playback. The global budget also bounds memory and database writes per instance.
type ErrorHandler struct {
	recorder ErrorRecorder
	secret   []byte
	mu       sync.Mutex
	window   time.Time
	total    int
	counts   map[string]int
}

func NewErrorHandler(recorder ErrorRecorder, secret string) *ErrorHandler {
	return &ErrorHandler{recorder: recorder, secret: []byte(secret), counts: make(map[string]int)}
}

func (h *ErrorHandler) allow(source, ip string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	if time.Since(h.window) >= time.Minute {
		h.window = time.Now()
		h.total = 0
		clear(h.counts)
	}
	if h.total >= 120 || h.counts["source:"+source] >= 10 || h.counts["ip:"+ip] >= 30 {
		return false
	}
	h.total++
	h.counts["source:"+source]++
	h.counts["ip:"+ip]++
	return true
}

var reportID = regexp.MustCompile(`^[a-f0-9-]{36}$`)

func (h *ErrorHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if isBotLikeUserAgent(r.UserAgent()) {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		w.WriteHeader(http.StatusUnsupportedMediaType)
		return
	}
	ip := clientIP(r)
	source := "ip:" + ip
	if session, ok := currentSessionID(r, h.secret); ok {
		source = "session:" + session
	}
	mac := hmac.New(sha256.New, h.secret)
	mac.Write([]byte("error-report:" + source))
	sourceHash := hex.EncodeToString(mac.Sum(nil))
	if !h.allow(sourceHash, ip) {
		w.Header().Set("Retry-After", "60")
		w.WriteHeader(http.StatusTooManyRequests)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 32*1024)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var event services.ErrorEvent
	if err := decoder.Decode(&event); err != nil || !event.Valid() || !reportID.MatchString(event.EventID) {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	// Client-supplied build IDs are labels only; all other browser context is bounded.
	if !strings.Contains("|chromium|firefox|safari|other|", "|"+event.Browser+"|") || strings.Contains(event.Browser, "|") {
		event.Browser = "other"
	}
	if err := h.recorder.Record(r.Context(), "browser", sourceHash, event); err != nil {
		log.Printf("Error ingestion unavailable: %v", err)
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ErrorOperation maps paths to a finite vocabulary, never storing identifiers.
func ErrorOperation(path string) string {
	if strings.HasPrefix(path, "/api/audio/key/") {
		for suffix, operation := range map[string]string{"/access": "media-access", "/download": "download", "/meta": "metadata", "/waveform": "waveform", "/thumbnail": "artwork"} {
			if strings.HasSuffix(strings.TrimRight(path, "/"), suffix) {
				return operation
			}
		}
		return "playback"
	}
	for prefix, operation := range map[string]string{
		"/api/folder/key/": "artwork", "/api/browse": "browse", "/api/search": "search", "/api/audio/random": "search",
		"/api/session/targeted-message": "targeted-message", "/api/profile/recovery-key": "recovery", "/api/profile/recover": "recovery",
		"/api/preferences/": "preferences", "/api/likes": "likes", "/api/contact": "contact", "/api/share": "source-request",
		"/api/playback/record": "playback-record", "/api/playback/recommendations/": "recommendations", "/api/playback/recent": "recent",
		"/api/playback/popular": "popular", "/api/playback/new": "new-tracks", "/api/playback/unavailable": "unavailable-tracks",
		"/api/stats": "stats", "/api/requests": "requests", "/api/admin/": "admin", "/api/version": "version",
	} {
		if strings.HasPrefix(path, prefix) {
			return operation
		}
	}
	if path == "/api/session" {
		return "session"
	}
	return "page"
}

type errorResponseWriter struct {
	http.ResponseWriter
	status       int
	writeError   error
	beforeHeader func(int)
}

func (w *errorResponseWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }
func (w *errorResponseWriter) WriteHeader(status int) {
	if w.status != 0 {
		return
	}
	if status >= 100 && status < 200 {
		w.ResponseWriter.WriteHeader(status)
		return
	}
	w.status = status
	w.beforeHeader(status)
	w.ResponseWriter.WriteHeader(status)
}
func (w *errorResponseWriter) Write(p []byte) (int, error) {
	if w.status == 0 {
		w.WriteHeader(http.StatusOK)
	}
	n, err := w.ResponseWriter.Write(p)
	if err != nil && !isClientDisconnect(err) {
		w.writeError = err
	}
	return n, err
}
func (w *errorResponseWriter) Flush() {
	if w.status == 0 {
		w.WriteHeader(http.StatusOK)
	}
	_ = http.NewResponseController(w.ResponseWriter).Flush()
}

func isClientDisconnect(err error) bool {
	return errors.Is(err, context.Canceled) || errors.Is(err, syscall.EPIPE) ||
		errors.Is(err, syscall.ECONNRESET) || errors.Is(err, net.ErrClosed)
}

type reportingReadSeeker struct {
	io.ReadSeeker
	ctx context.Context
}

func (r reportingReadSeeker) Read(p []byte) (int, error) {
	n, err := r.ReadSeeker.Read(p)
	if err != nil && err != io.EOF && !isClientDisconnect(err) {
		services.AddErrorContext(r.ctx, services.ErrorDetails(err))
		services.AnnotateError(r.ctx, "read", "io", "blocked")
	}
	return n, err
}

func (r reportingReadSeeker) Seek(offset int64, whence int) (int64, error) {
	n, err := r.ReadSeeker.Seek(offset, whence)
	if err != nil && !isClientDisconnect(err) {
		services.AddErrorContext(r.ctx, services.ErrorDetails(err))
		services.AnnotateError(r.ctx, "read", "io", "blocked")
	}
	return n, err
}

func ReportHTTPErrors(recorder ErrorRecorder, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/errors" {
			next.ServeHTTP(w, r)
			return
		}
		event := services.ErrorEvent{EventID: services.NewDiagnosticID(), Operation: ErrorOperation(r.URL.Path), Method: r.Method, Outcome: "blocked",
			Context: services.ErrorContext{Route: services.DiagnosticText(r.URL.Path, 300)}}
		started := time.Now()
		switch event.Operation {
		case "recommendations", "recent", "popular", "new-tracks", "unavailable-tracks", "metadata", "waveform", "artwork", "version", "playback-record":
			event.Outcome = "degraded"
		}
		r = r.WithContext(services.WithRequestError(r.Context(), &event))
		attempted := false
		persist := func(status int) bool {
			attempted = true
			event.Status = status
			event.Context.DurationMS = time.Since(started).Milliseconds()
			if event.Context.Message == "" {
				event.Context.Message = http.StatusText(status)
			}
			ctx, cancel := context.WithTimeout(context.Background(), time.Second)
			defer cancel()
			if err := recorder.Record(ctx, "server", "", event); err != nil {
				log.Printf("HTTP error reporting unavailable: %v", err)
				return false
			}
			return true
		}
		writer := &errorResponseWriter{ResponseWriter: w, beforeHeader: func(status int) {
			w.Header().Del("X-Error-Reporting")
			if status < 500 {
				return
			}
			if event.Cause == "" {
				services.AnnotateError(r.Context(), "response", "unavailable", event.Outcome)
			}
			if event.Cause != "" && persist(status) {
				w.Header().Set("X-Error-Reporting", "persisted")
			}
		}}
		defer func() {
			panicValue := recover()
			if panicValue != nil && panicValue != http.ErrAbortHandler {
				services.AddErrorContext(r.Context(), services.ErrorContext{Message: fmt.Sprint(panicValue), Stack: string(debug.Stack())})
				event.Stage = "request"
				event.Cause = "panic"
			}
			if writer.writeError != nil && event.Cause == "" {
				services.AddErrorContext(r.Context(), services.ErrorDetails(writer.writeError))
				event.Stage = "deliver"
				event.Cause = "io"
			}
			if event.Cause != "" && !attempted {
				persist(writer.status)
			}
			if panicValue != nil {
				panic(panicValue)
			}
		}()
		next.ServeHTTP(writer, r)
	})
}
