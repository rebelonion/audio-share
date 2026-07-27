package services

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

var (
	ErrCaptchaInvalid     = errors.New("captcha verification failed")
	ErrCaptchaUnavailable = errors.New("captcha verification unavailable")
)

type CaptchaVerifier interface {
	Verify(context.Context, string) error
}

type CapVerifier struct {
	verifyURL string
	secret    string
	client    *http.Client
}

func NewCapVerifier(verifyURL, secret string, timeout time.Duration) (*CapVerifier, error) {
	if verifyURL == "" || secret == "" {
		return nil, errors.New("Cap verification URL and secret are required")
	}
	if timeout <= 0 {
		return nil, errors.New("Cap verification timeout must be positive")
	}
	return &CapVerifier{
		verifyURL: verifyURL,
		secret:    secret,
		client:    &http.Client{Timeout: timeout},
	}, nil
}

func (v *CapVerifier) Verify(ctx context.Context, token string) error {
	if token == "" {
		return ErrCaptchaInvalid
	}
	body, err := json.Marshal(map[string]string{
		"secret":   v.secret,
		"response": token,
	})
	if err != nil {
		return fmt.Errorf("%w: encode request", ErrCaptchaUnavailable)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, v.verifyURL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("%w: create request", ErrCaptchaUnavailable)
	}
	req.Header.Set("Content-Type", "application/json")

	response, err := v.client.Do(req)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrCaptchaUnavailable, err)
	}
	defer response.Body.Close()

	var result struct {
		Success bool `json:"success"`
	}
	decoder := json.NewDecoder(io.LimitReader(response.Body, 4096))
	if err := decoder.Decode(&result); err != nil {
		return fmt.Errorf("%w: invalid response", ErrCaptchaUnavailable)
	}
	if response.StatusCode >= http.StatusInternalServerError {
		return ErrCaptchaUnavailable
	}
	if !result.Success {
		return ErrCaptchaInvalid
	}
	return nil
}
