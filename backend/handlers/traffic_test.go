package handlers

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/onion/audio-share-backend/services"
)

func TestTrafficKindClassifiesPublicRoutes(t *testing.T) {
	for path, want := range map[string]services.TrafficKind{
		"/api/audio/key/abc":           services.TrafficStream,
		"/api/audio/key/abc/download":  services.TrafficDownload,
		"/api/audio/key/abc/thumbnail": services.TrafficArtwork,
		"/api/audio/key/abc/waveform":  services.TrafficAPI,
		"/api/audio/key/abc/meta":      services.TrafficAPI,
		"/api/audio/key/abc/access":    services.TrafficAPI,
		"/api/audio/key/":              services.TrafficAPI,
		"/api/folder/key/xyz/poster":   services.TrafficArtwork,
		"/api/search":                  services.TrafficAPI,
		"/assets/index.js":             services.TrafficWeb,
		"/share/abc":                   services.TrafficWeb,
	} {
		if got := trafficKind(path); got != want {
			t.Errorf("%s: got %s, want %s", path, got, want)
		}
	}
}

func TestCountTrafficCountsServedAndRangeBytes(t *testing.T) {
	file := filepath.Join(t.TempDir(), "track.mp3")
	// Larger than one sendfile chunk so the chunked file path is exercised.
	if err := os.WriteFile(file, bytes.Repeat([]byte("a"), 2_500_000), 0o644); err != nil {
		t.Fatal(err)
	}
	serve := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/audio/key/abc" {
			w.Write([]byte("hello"))
			return
		}
		http.ServeFile(w, r, file)
	})
	// Production wraps handlers in the error reporter when ntfy alerts are on.
	for name, inner := range map[string]http.Handler{"plain": serve, "error reporting": ReportHTTPErrors(&memoryErrors{}, serve)} {
		t.Run(name, func(t *testing.T) {
			meter := services.NewTrafficMeter(nil)
			server := httptest.NewServer(CountTraffic(meter, inner))
			defer server.Close()

			fetchCounted(t, server.URL+"/api/audio/key/abc", "")
			fetchCounted(t, server.URL+"/api/audio/key/abc", "bytes=1000-2400999")
			fetchCounted(t, server.URL+"/api/search", "")
			fetchCounted(t, server.URL+"/api/admin/traffic/live", "")

			if got, want := meter.Count(services.TrafficStream), (services.TrafficCount{Bytes: 4_900_000, Requests: 2}); got != want {
				t.Fatalf("stream count = %+v, want %+v", got, want)
			}
			if got, want := meter.Count(services.TrafficAPI), (services.TrafficCount{Bytes: 5, Requests: 1}); got != want {
				t.Fatalf("api count = %+v, want %+v (admin requests must be skipped)", got, want)
			}
		})
	}
}

// stallingReader returns its data, then blocks like a throttled stream waiting
// for bandwidth until release is closed.
type stallingReader struct {
	data    *bytes.Reader
	release chan struct{}
}

func (r stallingReader) Read(p []byte) (int, error) {
	if r.data.Len() > 0 {
		return r.data.Read(p)
	}
	<-r.release
	return 0, io.EOF
}

func TestCountTrafficCountsBytesBeforeResponseFinishes(t *testing.T) {
	meter := services.NewTrafficMeter(nil)
	release := make(chan struct{})
	server := httptest.NewServer(CountTraffic(meter, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.Copy(w, io.LimitReader(stallingReader{bytes.NewReader(make([]byte, 64_000)), release}, 100_000))
	})))
	defer server.Close()
	defer close(release)

	response, err := http.Get(server.URL + "/api/audio/key/abc")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	// The copy is still in progress, so counted bytes were counted mid-response.
	deadline := time.Now().Add(2 * time.Second)
	for meter.Count(services.TrafficStream).Bytes != 64_000 {
		if time.Now().After(deadline) {
			t.Fatalf("bytes counted while the response is open = %d, want 64000", meter.Count(services.TrafficStream).Bytes)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func fetchCounted(t *testing.T, url, rangeHeader string) {
	t.Helper()
	request, _ := http.NewRequest(http.MethodGet, url, nil)
	if rangeHeader != "" {
		request.Header.Set("Range", rangeHeader)
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	io.Copy(io.Discard, response.Body)
	response.Body.Close()
}

func TestTrafficLiveReportsLifecycleMediaCounts(t *testing.T) {
	handler := &AdminHandler{ActiveMedia: func() (int, int) { return 2, 1 }}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/admin/traffic/live", nil))
	var live services.TrafficLive
	if err := json.NewDecoder(recorder.Body).Decode(&live); err != nil {
		t.Fatal(err)
	}
	if live.ActiveStreams != 2 || live.ActiveDownloads != 1 {
		t.Fatalf("live media = %d streams, %d downloads", live.ActiveStreams, live.ActiveDownloads)
	}
}
