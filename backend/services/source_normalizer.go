package services

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

const normalizerOutputLimit = 64 * 1024

type NormalizedSource struct {
	SourceKey    string `json:"sourceKey"`
	CanonicalURL string `json:"canonicalUrl"`
	Platform     string `json:"platform"`
	Title        string `json:"title"`
}

type SourceNormalizationError struct {
	Code    string
	Message string
}

func (e *SourceNormalizationError) Error() string {
	return e.Message
}

type SourceNormalizer interface {
	IsConfigured() bool
	Normalize(ctx context.Context, rawURL string) (*NormalizedSource, error)
}

type ScriptSourceNormalizer struct {
	scriptPath string
	timeout    time.Duration
}

func NewScriptSourceNormalizer(scriptPath string, timeout time.Duration) *ScriptSourceNormalizer {
	return &ScriptSourceNormalizer{scriptPath: strings.TrimSpace(scriptPath), timeout: timeout}
}

func (n *ScriptSourceNormalizer) IsConfigured() bool {
	return n.scriptPath != ""
}

type limitedBuffer struct {
	buffer bytes.Buffer
	limit  int
}

func (w *limitedBuffer) Write(p []byte) (int, error) {
	remaining := w.limit - w.buffer.Len()
	if remaining <= 0 {
		return len(p), nil
	}
	if len(p) > remaining {
		_, _ = w.buffer.Write(p[:remaining])
		return len(p), nil
	}
	return w.buffer.Write(p)
}

func (w *limitedBuffer) String() string {
	return w.buffer.String()
}

func (n *ScriptSourceNormalizer) Normalize(ctx context.Context, rawURL string) (*NormalizedSource, error) {
	if !n.IsConfigured() {
		return nil, errors.New("source normalizer is not configured")
	}

	timeout := n.timeout
	if timeout <= 0 {
		timeout = 15 * time.Second
	}
	commandContext, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	input, err := json.Marshal(map[string]string{"url": rawURL})
	if err != nil {
		return nil, err
	}

	command := exec.CommandContext(commandContext, "python3", n.scriptPath)
	command.Stdin = bytes.NewReader(input)
	stdout := &limitedBuffer{limit: normalizerOutputLimit}
	stderr := &limitedBuffer{limit: normalizerOutputLimit}
	command.Stdout = stdout
	command.Stderr = stderr
	runErr := command.Run()

	if errors.Is(commandContext.Err(), context.DeadlineExceeded) {
		return nil, &SourceNormalizationError{
			Code:    "timeout",
			Message: "Source resolution timed out. Please try again.",
		}
	}

	var response struct {
		NormalizedSource
		Error *struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(stdout.buffer.Bytes(), &response); err != nil {
		if runErr != nil {
			return nil, fmt.Errorf("source normalizer failed: %w: %s", runErr, strings.TrimSpace(stderr.String()))
		}
		return nil, fmt.Errorf("source normalizer returned invalid JSON: %w", err)
	}
	if response.Error != nil {
		return nil, &SourceNormalizationError{
			Code:    response.Error.Code,
			Message: response.Error.Message,
		}
	}
	if runErr != nil {
		return nil, fmt.Errorf("source normalizer failed: %w: %s", runErr, strings.TrimSpace(stderr.String()))
	}
	if response.SourceKey == "" || response.CanonicalURL == "" || response.Platform == "" {
		return nil, errors.New("source normalizer returned an incomplete result")
	}
	return &response.NormalizedSource, nil
}
