package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/onion/audio-share-backend/services"
)

type recordedError struct {
	origin, sourceHash string
	event              services.ErrorEvent
}
type memoryErrors struct {
	events []recordedError
	fail   bool
}

func (m *memoryErrors) Record(_ context.Context, origin, sourceHash string, e services.ErrorEvent) error {
	if m.fail {
		return errors.New("db unavailable")
	}
	m.events = append(m.events, recordedError{origin, sourceHash, e})
	return nil
}

const validReport = `{"eventId":"00000000-0000-4000-8000-000000000001","operation":"captcha","stage":"solve","cause":"unavailable","outcome":"blocked","browser":"firefox"}`

func TestErrorIngestionIgnoresBotsWithoutConsumingLimits(t *testing.T) {
	for _, userAgent := range []string{
		"Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0",
		"Mozilla/5.0 (compatible; YandexRenderResourcesBot/1.0; +http://yandex.com/bots) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0",
		"Googlebot/2.1",
	} {
		t.Run(userAgent, func(t *testing.T) {
			recorder := &memoryErrors{}
			h := NewErrorHandler(recorder, "secret")
			for range 125 {
				r := httptest.NewRequest(http.MethodPost, "/api/errors", strings.NewReader(validReport))
				r.Header.Set("Content-Type", "application/json")
				r.Header.Set("User-Agent", userAgent)
				w := httptest.NewRecorder()
				h.ServeHTTP(w, r)
				if w.Code != http.StatusNoContent {
					t.Fatalf("bot report returned %d", w.Code)
				}
			}
			if len(recorder.events) != 0 || h.total != 0 || len(h.counts) != 0 {
				t.Fatal("bot reports were recorded or consumed ingestion limits")
			}
			r := httptest.NewRequest(http.MethodPost, "/api/errors", strings.NewReader(validReport))
			r.Header.Set("Content-Type", "application/json")
			r.Header.Set("User-Agent", "Mozilla/5.0 Chrome/108.0.0.0 Safari/537.36")
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != http.StatusNoContent || len(recorder.events) != 1 {
				t.Fatal("ordinary browser report was not accepted after crawler traffic")
			}
		})
	}
}

func TestHTTPErrorIncludesDiagnosticContext(t *testing.T) {
	recorder := &memoryErrors{}
	h := ReportHTTPErrors(recorder, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		services.AddErrorContext(r.Context(), services.ErrorDetails(errors.New("open source/poster.jpg: permission denied")))
		w.WriteHeader(500)
	}))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/api/audio/key/track/thumbnail?token=private", nil))
	if len(recorder.events) != 1 {
		t.Fatal("missing report")
	}
	e := recorder.events[0].event
	if e.EventID == "" || e.Context.Route != "/api/audio/key/track/thumbnail" || !strings.Contains(e.Context.Message, "permission denied") || e.Context.Step == "" {
		t.Fatalf("missing context: %+v", e)
	}
}

func TestHTTPErrorPreservesDiagnosticCode(t *testing.T) {
	recorder := &memoryErrors{}
	h := ReportHTTPErrors(recorder, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		services.AnnotateErrorCode(r.Context(), "db_numeric_out_of_range")
		w.WriteHeader(http.StatusInternalServerError)
	}))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/api/playback/recommendations/track", nil))
	if len(recorder.events) != 1 {
		t.Fatalf("got %d reports", len(recorder.events))
	}
	event := recorder.events[0].event
	if event.Code != "db_numeric_out_of_range" || event.Operation != "recommendations" || event.Status != 500 || event.Cause != "unavailable" {
		t.Fatalf("unexpected event: %+v", event)
	}
}

func TestErrorIngestionValidationSessionAndLimits(t *testing.T) {
	recorder := &memoryErrors{}
	h := NewErrorHandler(recorder, "secret")
	send := func(body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", "/api/errors", strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		r.AddCookie(&http.Cookie{Name: sessionCookieName, Value: signValue("session-a", []byte("secret"))})
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	if w := send(validReport); w.Code != 204 {
		t.Fatal(w.Code)
	}
	if len(recorder.events) != 1 || recorder.events[0].sourceHash == "session-a" || len(recorder.events[0].sourceHash) != 64 {
		t.Fatalf("session identity not hashed: %+v", recorder.events)
	}
	for _, body := range []string{
		strings.Replace(validReport, `"captcha"`, `"arbitrary-value"`, 1),
		strings.Replace(validReport, `"browser":"firefox"`, `"message":"secret"`, 1),
		validReport + `{}`, strings.Repeat("x", 2049),
	} {
		if w := send(body); w.Code != 400 {
			t.Errorf("invalid report returned %d", w.Code)
		}
	}
	for range 5 {
		send(validReport)
	}
	if w := send(validReport); w.Code != 429 {
		t.Fatalf("session limit status %d", w.Code)
	}
}

func TestErrorIngestionNoRecursiveFailureOrSessionCreation(t *testing.T) {
	recorder := &memoryErrors{fail: true}
	h := ReportHTTPErrors(recorder, NewErrorHandler(recorder, "secret"))
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/errors", strings.NewReader(validReport))
	r.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(w, r)
	if w.Code != 503 || len(recorder.events) != 0 || len(w.Result().Cookies()) != 0 {
		t.Fatal("failed ingestion was not isolated")
	}
}

func TestErrorIngestionSourceIdentity(t *testing.T) {
	record := func(secret, address, cookie string) string {
		t.Helper()
		recorder := &memoryErrors{}
		r := httptest.NewRequest("POST", "/api/errors", strings.NewReader(validReport))
		r.RemoteAddr = address
		r.Header.Set("Content-Type", "application/json")
		if cookie != "" {
			r.AddCookie(&http.Cookie{Name: sessionCookieName, Value: cookie})
		}
		w := httptest.NewRecorder()
		NewErrorHandler(recorder, secret).ServeHTTP(w, r)
		if w.Code != http.StatusNoContent || len(recorder.events) != 1 || len(w.Result().Cookies()) != 0 {
			t.Fatalf("status=%d, events=%d, cookies=%v", w.Code, len(recorder.events), w.Result().Cookies())
		}
		source := recorder.events[0].sourceHash
		if len(source) != 64 || strings.Contains(source, "192.0.2.") {
			t.Fatalf("source identity not hashed: %q", source)
		}
		return source
	}
	ipSource := record("secret", "192.0.2.1:1234", "")
	if got := record("secret", "192.0.2.1:5678", ""); got != ipSource {
		t.Fatal("same IP counted as different sources")
	}
	if got := record("secret", "192.0.2.2:1234", ""); got == ipSource {
		t.Fatal("different IPs counted as the same source")
	}
	if got := record("secret", "192.0.2.1:1234", "invalid"); got != ipSource {
		t.Fatal("invalid session did not fall back to IP")
	}
	if got := record("different-secret", "192.0.2.1:1234", ""); got == ipSource {
		t.Fatal("source hash not keyed by secret")
	}
	cookie := signValue("192.0.2.1", []byte("secret"))
	sessionSource := record("secret", "192.0.2.1:1234", cookie)
	if sessionSource == ipSource {
		t.Fatal("session and IP namespaces collided")
	}
	if got := record("secret", "192.0.2.2:1234", cookie); got != sessionSource {
		t.Fatal("valid session identity changed with IP")
	}
}

func TestErrorIngestionIPFallbackRateLimit(t *testing.T) {
	recorder := &memoryErrors{}
	h := NewErrorHandler(recorder, "secret")
	send := func(address string) int {
		r := httptest.NewRequest("POST", "/api/errors", strings.NewReader(validReport))
		r.RemoteAddr = address
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if len(w.Result().Cookies()) != 0 {
			t.Fatal("reporting set a cookie")
		}
		return w.Code
	}
	for range 10 {
		if got := send("192.0.2.1:1234"); got != http.StatusNoContent {
			t.Fatalf("report rejected: %d", got)
		}
	}
	if got := send("192.0.2.1:5678"); got != http.StatusTooManyRequests {
		t.Fatalf("IP fallback bypassed source limit: %d", got)
	}
	if got := send("192.0.2.2:1234"); got != http.StatusNoContent {
		t.Fatalf("unrelated IP shared source limit: %d", got)
	}
}

func TestErrorIngestionDelayedResponsePreservesMediaSession(t *testing.T) {
	const secret = "secret"
	report := httptest.NewRequest("POST", "https://example.com/api/errors", strings.NewReader(validReport))
	report.Header.Set("Content-Type", "application/json")
	reportResponse := httptest.NewRecorder()
	NewErrorHandler(&memoryErrors{}, secret).ServeHTTP(reportResponse, report)
	if reportResponse.Code != http.StatusNoContent {
		t.Fatal(reportResponse.Code)
	}
	bootstrapResponse := httptest.NewRecorder()
	NewSessionBootstrapHandler(secret).ServeHTTP(bootstrapResponse, httptest.NewRequest("POST", "https://example.com/api/session", nil))
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatal(err)
	}
	origin := &url.URL{Scheme: "https", Host: "example.com", Path: "/"}
	jar.SetCookies(origin, bootstrapResponse.Result().Cookies())
	mediaRequest := func() *http.Request {
		r := httptest.NewRequest("GET", "https://example.com/api/audio/key/track", nil)
		for _, cookie := range jar.Cookies(r.URL) {
			r.AddCookie(cookie)
		}
		return r
	}
	session, ok := currentSessionID(mediaRequest(), []byte(secret))
	if !ok {
		t.Fatal("bootstrap did not establish session")
	}
	keys, err := services.NewAccessKeyManager(secret, "10/1m", "10/1m", time.Minute, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	grant, err := keys.Issue(session, "192.0.2.1", "track", services.MediaPurposeStream)
	if err != nil {
		t.Fatal(err)
	}
	// The earlier reporting response arrives after bootstrap and key issuance.
	jar.SetCookies(origin, reportResponse.Result().Cookies())
	current, ok := currentSessionID(mediaRequest(), []byte(secret))
	if !ok || current != session {
		t.Fatal("delayed report replaced the media session")
	}
	if err := keys.Verify(grant.AccessKey, current, "track", services.MediaPurposeStream); err != nil {
		t.Fatalf("delayed report invalidated access key: %v", err)
	}
}

func TestHTTPErrorReportsPreserveResponseAndIgnoreExpectedFailures(t *testing.T) {
	for _, status := range []int{200, 401, 403, 404, 429, 500, 503} {
		recorder := &memoryErrors{}
		h := ReportHTTPErrors(recorder, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(status); w.Write([]byte("body")) }))
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest("GET", "/api/search?q=secret", nil))
		if w.Code != status || w.Body.String() != "body" {
			t.Fatal("response changed")
		}
		want := 0
		if status >= 500 {
			want = 1
		}
		if len(recorder.events) != want {
			t.Fatalf("status %d: %d reports", status, len(recorder.events))
		}
		if want > 0 {
			data, _ := json.Marshal(recorder.events[0].event)
			if strings.Contains(string(data), "secret") || recorder.events[0].event.Operation != "search" {
				t.Fatal("raw URL leaked")
			}
		}
	}
}

type errorRecorderFunc func(context.Context, string, string, services.ErrorEvent) error

func (f errorRecorderFunc) Record(ctx context.Context, origin, source string, event services.ErrorEvent) error {
	return f(ctx, origin, source, event)
}

func TestHTTPErrorAcknowledgmentRequiresPersistence(t *testing.T) {
	for _, tc := range []struct {
		name string
		fail bool
	}{{"saved", false}, {"database unavailable", true}} {
		t.Run(tc.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			attempts := 0
			recorder := errorRecorderFunc(func(ctx context.Context, origin, source string, event services.ErrorEvent) error {
				attempts++
				if w.Header().Get("X-Error-Reporting") != "" {
					t.Fatal("persistence acknowledged before insert")
				}
				deadline, ok := ctx.Deadline()
				if !ok || time.Until(deadline) > time.Second || ctx.Err() != nil {
					t.Fatal("missing bounded reporting context")
				}
				if event.Status != 503 || event.Cause != "unavailable" || origin != "server" {
					t.Fatalf("unexpected report: %+v", event)
				}
				if tc.fail {
					return errors.New("database unavailable")
				}
				return nil
			})
			h := ReportHTTPErrors(recorder, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(503)
				if attempts != 1 {
					t.Fatal("headers sent before persistence attempt")
				}
				w.Write([]byte("unavailable"))
			}))
			h.ServeHTTP(w, httptest.NewRequest("GET", "/api/search", nil))
			want := "persisted"
			if tc.fail {
				want = ""
			}
			if got := w.Result().Header.Get("X-Error-Reporting"); got != want {
				t.Fatalf("acknowledgment %q, want %q", got, want)
			}
			if attempts != 1 || w.Code != 503 || w.Body.String() != "unavailable" {
				t.Fatalf("attempts=%d status=%d body=%q", attempts, w.Code, w.Body.String())
			}
		})
	}
}

func TestHTTPErrorAnnotationSurvivesLaterCancellation(t *testing.T) {
	for _, status := range []int{206, 503} {
		ctx, cancel := context.WithCancel(context.Background())
		calls := 0
		recorder := errorRecorderFunc(func(ctx context.Context, _, _ string, event services.ErrorEvent) error {
			calls++
			if ctx.Err() != nil {
				t.Fatal("report inherited canceled request context")
			}
			if _, ok := ctx.Deadline(); !ok {
				t.Fatal("unbounded persistence context")
			}
			if event.Stage != "store" || event.Outcome != "degraded" || event.Status != status {
				t.Fatalf("earlier failure lost: %+v", event)
			}
			return nil
		})
		h := ReportHTTPErrors(recorder, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			services.AnnotateError(r.Context(), "store", "unavailable", "degraded")
			cancel()
			services.AnnotateError(r.Context(), "read", "io", "blocked")
			w.WriteHeader(status)
		}))
		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/api/audio/key/track", nil).WithContext(ctx))
		cancel()
		if calls != 1 {
			t.Fatalf("status %d: got %d reports, want one", status, calls)
		}
	}
}

type failingErrorResponseWriter struct {
	*httptest.ResponseRecorder
	err error
}

func (w failingErrorResponseWriter) Write([]byte) (int, error) { return 0, w.err }

func TestHTTPWriteFailureSurvivesCancellationButDisconnectsStayQuiet(t *testing.T) {
	for _, tc := range []struct {
		err  error
		want int
	}{
		{errors.New("output failure"), 1},
		{context.Canceled, 0},
		{syscall.EPIPE, 0},
		{syscall.ECONNRESET, 0},
	} {
		recorder := &memoryErrors{}
		ctx, cancel := context.WithCancel(context.Background())
		h := ReportHTTPErrors(recorder, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Write([]byte("audio"))
			cancel()
		}))
		h.ServeHTTP(failingErrorResponseWriter{httptest.NewRecorder(), tc.err}, httptest.NewRequest("GET", "/api/audio/key/track", nil).WithContext(ctx))
		cancel()
		if len(recorder.events) != tc.want {
			t.Fatalf("%v: got %d reports, want %d", tc.err, len(recorder.events), tc.want)
		}
	}
}

func TestHTTPErrorReportsDegradationPanicsAndCancellation(t *testing.T) {
	recorder := &memoryErrors{}
	h := ReportHTTPErrors(recorder, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		services.AnnotateError(r.Context(), "normalize", "unavailable", "degraded")
		w.WriteHeader(200)
	}))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("POST", "/api/share", nil))
	if len(recorder.events) != 1 || recorder.events[0].event.Outcome != "degraded" {
		t.Fatal("partial success unreported")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("POST", "/api/share", nil).WithContext(ctx))
	if len(recorder.events) != 1 {
		t.Fatal("canceled request reported")
	}
	func() {
		defer func() {
			if recover() != "boom" {
				t.Fatal("panic swallowed")
			}
		}()
		ReportHTTPErrors(recorder, http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("boom") })).ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/", nil))
	}()
	if len(recorder.events) != 2 || recorder.events[1].event.Cause != "panic" {
		t.Fatal("panic unreported")
	}
}

type brokenReader struct{}

func (brokenReader) Read([]byte) (int, error)       { return 0, errors.New("read failed") }
func (brokenReader) Seek(int64, int) (int64, error) { return 0, nil }

func TestMediaReadFailureAfterHeadersIsReported(t *testing.T) {
	recorder := &memoryErrors{}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	h := ReportHTTPErrors(recorder, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(206)
		_, _ = io.Copy(w, reportingReadSeeker{ReadSeeker: brokenReader{}, ctx: r.Context()})
		cancel()
	}))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/api/audio/key/secret/download?access_key=secret", nil).WithContext(ctx))
	if w.Code != 206 || len(recorder.events) != 1 || recorder.events[0].event.Cause != "io" {
		t.Fatal("mid-response read failure lost")
	}
}

func TestCanceledStreamDoesNotProduceErrorReport(t *testing.T) {
	for _, status := range []int{206, 500} {
		recorder := &memoryErrors{}
		ctx, cancel := context.WithCancel(context.Background())
		h := ReportHTTPErrors(recorder, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cancel()
			_, _ = reportingReadSeeker{ReadSeeker: brokenReader{}, ctx: r.Context()}.Read(make([]byte, 1))
			w.WriteHeader(status)
		}))
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest("GET", "/api/audio/key/track", nil).WithContext(ctx))
		cancel()
		if len(recorder.events) != 0 || w.Result().Header.Get("X-Error-Reporting") != "" {
			t.Fatalf("canceled stream reported for status %d", status)
		}
	}
}
