package handlers

import (
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/onion/audio-share-backend/services"
)

// CountTraffic records the response bytes written for each public request.
// It wraps the application middleware, so responses rejected by rate limits
// or security checks are counted; only the lifecycle's /health and /ready
// probes sit outside it. Every /api/admin/ request is skipped, including
// failed sign-ins, because admin traffic is not visitor traffic.
func CountTraffic(meter *services.TrafficMeter, next http.Handler) http.Handler {
	if meter == nil {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/admin/") {
			next.ServeHTTP(w, r)
			return
		}
		kind := trafficKind(r.URL.Path)
		meter.Request(kind)
		next.ServeHTTP(&countingResponseWriter{ResponseWriter: w, meter: meter, kind: kind}, r)
	})
}

func trafficKind(path string) services.TrafficKind {
	switch {
	case strings.HasPrefix(path, "/api/audio/key/"):
		key, action := parseAudioRoute(path)
		switch {
		case key == "":
			return services.TrafficAPI
		case action == "stream":
			return services.TrafficStream
		case action == "download":
			return services.TrafficDownload
		case action == "thumbnail":
			return services.TrafficArtwork
		}
		return services.TrafficAPI
	case strings.HasPrefix(path, "/api/folder/key/") && strings.HasSuffix(path, "/poster"):
		return services.TrafficArtwork
	case strings.HasPrefix(path, "/api/"):
		return services.TrafficAPI
	}
	return services.TrafficWeb
}

type countingResponseWriter struct {
	http.ResponseWriter
	meter *services.TrafficMeter
	kind  services.TrafficKind
}

func (w *countingResponseWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func (w *countingResponseWriter) Write(p []byte) (int, error) {
	n, err := w.ResponseWriter.Write(p)
	w.meter.Add(w.kind, int64(n))
	return n, err
}

// ReadFrom keeps the server's sendfile path for file ranges, which is how
// http.ServeContent and http.ServeFile send files. It copies in bounded chunks
// so a long transfer is counted while it runs, not only when it ends. Other
// sources, such as throttled audio, go through the counting Write.
func (w *countingResponseWriter) ReadFrom(src io.Reader) (int64, error) {
	limited, ok := src.(*io.LimitedReader)
	if !ok {
		return io.Copy(writerOnly{w}, src)
	}
	if _, file := limited.R.(*os.File); !file {
		return io.Copy(writerOnly{w}, src)
	}
	var total int64
	for limited.N > 0 {
		chunk := &io.LimitedReader{R: limited.R, N: min(limited.N, 1<<20)}
		n, err := io.Copy(w.ResponseWriter, chunk)
		limited.N -= n
		total += n
		w.meter.Add(w.kind, n)
		if err != nil || n == 0 {
			return total, err
		}
	}
	return total, nil
}

func (w *countingResponseWriter) Flush() {
	_ = http.NewResponseController(w.ResponseWriter).Flush()
}
