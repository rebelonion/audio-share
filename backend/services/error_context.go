package services

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"unicode/utf8"
)

// ErrorContext contains diagnostics, never request bodies, headers, or cookies.
type ErrorContext struct {
	Route          string         `json:"route,omitempty"`
	Endpoint       string         `json:"endpoint,omitempty"`
	Resource       string         `json:"resource,omitempty"`
	Step           string         `json:"step,omitempty"`
	Message        string         `json:"message,omitempty"`
	Stack          string         `json:"stack,omitempty"`
	ComponentStack string         `json:"componentStack,omitempty"`
	DurationMS     int64          `json:"durationMs,omitempty"`
	Online         *bool          `json:"online,omitempty"`
	Failures       []ErrorContext `json:"failures,omitempty"`
	FailureCounts  map[string]int `json:"failureCounts,omitempty"`
}

var diagnosticURL = regexp.MustCompile(`(?i)[a-z][a-z0-9+.-]*://[^\s<>"']+`)
var diagnosticQuery = regexp.MustCompile(`[?#][^\s<>"']*`)
var diagnosticAuthorization = regexp.MustCompile(`(?i)(\b(?:authorization|proxy-authorization|cookie|set-cookie)["']?\s*[=:]\s*)[^\r\n]*`)
var diagnosticAuthScheme = regexp.MustCompile(`(?i)(\b(?:bearer|basic)\s+)[^\s,;"'}]+`)
var diagnosticSecret = regexp.MustCompile(`(?i)(\b(?:password|passwd|token|secret|access[_-]?key|recovery[_-]?key|api[_-]?key|cap[_-]?token|access[_-]?token|refresh[_-]?token|session[_-]?secret|client[_-]?secret)["']?\s*[=:]\s*)(?:"(?:\\.|[^"\\])*(?:"|$)|'(?:\\.|[^'\\])*(?:'|$)|[^\s,;"'}]+)`)

func DiagnosticText(value string, limit int) string {
	value = diagnosticURL.ReplaceAllStringFunc(value, func(raw string) string {
		// Retain the resource and stack location, excluding URL credentials and queries.
		if start := strings.Index(raw, "://"); start >= 0 {
			if at := strings.Index(raw[start+3:], "@"); at >= 0 {
				raw = raw[:start+3] + raw[start+3+at+1:]
			}
		}
		return diagnosticQuery.ReplaceAllString(raw, "")
	})
	value = diagnosticQuery.ReplaceAllString(value, "")
	value = diagnosticAuthorization.ReplaceAllString(value, "${1}[redacted]")
	value = diagnosticAuthScheme.ReplaceAllString(value, "${1}[redacted]")
	value = diagnosticSecret.ReplaceAllString(value, "${1}[redacted]")
	value = strings.Map(func(r rune) rune {
		if r < 32 && r != '\n' && r != '\t' {
			return -1
		}
		return r
	}, value)
	value = strings.ToValidUTF8(value, "")
	if len(value) > limit {
		value = value[:limit]
		for !utf8.ValidString(value) {
			value = value[:len(value)-1]
		}
		return value + "…"
	}
	return value
}

func (c ErrorContext) sanitized() ErrorContext {
	c.Route = DiagnosticText(c.Route, 300)
	c.Endpoint = DiagnosticText(c.Endpoint, 300)
	c.Resource = DiagnosticText(c.Resource, 300)
	c.Step = DiagnosticText(c.Step, 100)
	c.Message = DiagnosticText(c.Message, 1000)
	c.Stack = DiagnosticText(c.Stack, 3000)
	c.ComponentStack = DiagnosticText(c.ComponentStack, 1500)
	if c.DurationMS < 0 {
		c.DurationMS = 0
	}
	if len(c.Failures) > 5 {
		c.Failures = c.Failures[:5]
	}
	c.Failures = append([]ErrorContext(nil), c.Failures...)
	for i := range c.Failures {
		c.Failures[i].Failures = nil
		c.Failures[i].Stack = ""
		c.Failures[i].ComponentStack = ""
		c.Failures[i].FailureCounts = nil
		c.Failures[i] = c.Failures[i].sanitized()
	}
	counts := make(map[string]int)
	for key, count := range c.FailureCounts {
		if len(counts) == 10 {
			break
		}
		if count > 0 {
			counts[SafeDiagnosticLabel(key)] = count
		}
	}
	c.FailureCounts = counts
	return c
}

func NewDiagnosticID() string { return rand.Text() }

func ErrorDetails(err error) ErrorContext {
	if err == nil {
		return ErrorContext{}
	}
	details := ErrorContext{Message: err.Error()}
	if _, file, line, ok := runtime.Caller(1); ok {
		details.Step = fmt.Sprintf("%s:%d", filepath.Base(file), line)
	}
	var pathErr *fs.PathError
	if errors.As(err, &pathErr) {
		details.Resource = pathErr.Path
	}
	return details.sanitized()
}

func AnnotateFileError(ctx context.Context, err error, path, outcome string) {
	cause := "io"
	if errors.Is(err, fs.ErrNotExist) {
		cause = "missing-file"
	}
	details := ErrorDetails(err)
	details.Resource = path
	if err == nil {
		details.Message = "Expected a file, found a directory"
	}
	AddErrorContext(ctx, details)
	AnnotateError(ctx, "read", cause, outcome)
}

// AddErrorContext enriches a request; it does not turn expected errors into reports.
func AddErrorContext(ctx context.Context, details ErrorContext) {
	if event, ok := ctx.Value(errorContextKey{}).(*ErrorEvent); ok {
		details = details.sanitized()
		if details.Message != "" {
			event.Context.Message = details.Message
		}
		if details.Resource != "" {
			event.Context.Resource = details.Resource
		}
		if details.Step != "" {
			event.Context.Step = details.Step
		}
		if details.Stack != "" {
			event.Context.Stack = details.Stack
		}
	}
}

// FailureExamples keeps a bounded sample while jobs retain their total failure count.
type FailureExamples struct {
	mu     sync.Mutex
	items  []ErrorContext
	counts map[string]int
}

func (f *FailureExamples) Add(step, resource string, err error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.counts == nil {
		f.counts = make(map[string]int)
	}
	f.counts[step]++
	if len(f.items) < 5 {
		details := ErrorDetails(err)
		details.Step, details.Resource = step, resource
		f.items = append(f.items, details.sanitized())
	}
}

func (f *FailureExamples) Context() ErrorContext {
	f.mu.Lock()
	defer f.mu.Unlock()
	counts := make(map[string]int, len(f.counts))
	for step, count := range f.counts {
		counts[step] = count
	}
	return ErrorContext{Failures: append([]ErrorContext(nil), f.items...), FailureCounts: counts}
}

func diagnosticSummary(raw []byte) string {
	var c ErrorContext
	if json.Unmarshal(raw, &c) != nil {
		return ""
	}
	c = c.sanitized()
	var lines []string
	for _, field := range []struct{ label, value string }{
		{"Route", c.Route}, {"Endpoint", c.Endpoint}, {"Resource", c.Resource},
		{"Step", c.Step}, {"Error", c.Message},
	} {
		if field.value != "" {
			lines = append(lines, field.label+": "+field.value)
		}
	}
	if c.DurationMS > 0 {
		lines = append(lines, fmt.Sprintf("Duration: %dms", c.DurationMS))
	}
	if c.Online != nil {
		lines = append(lines, fmt.Sprintf("Browser online: %t", *c.Online))
	}
	if len(c.FailureCounts) > 0 {
		counts, _ := json.Marshal(c.FailureCounts)
		lines = append(lines, "Failures by step: "+string(counts))
	}
	for _, failure := range c.Failures {
		lines = append(lines, fmt.Sprintf("Failure: %s %s: %s", failure.Step, failure.Resource, failure.Message))
	}
	if c.Stack != "" {
		lines = append(lines, "Stack: "+DiagnosticText(c.Stack, 450))
	}
	if c.ComponentStack != "" {
		lines = append(lines, "Components: "+DiagnosticText(c.ComponentStack, 300))
	}
	return DiagnosticText(strings.Join(lines, "\n"), 1000)
}
