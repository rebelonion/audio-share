package services

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestCapVerifier(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var request map[string]string
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
				t.Fatalf("decode verification request: %v", err)
			}
			if request["secret"] != "site-secret" || request["response"] != "cap-token" {
				t.Fatalf("unexpected verification request: %#v", request)
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"success":true}`))
		}))
		defer server.Close()

		verifier, err := NewCapVerifier(server.URL, "site-secret", time.Second)
		if err != nil {
			t.Fatalf("NewCapVerifier returned error: %v", err)
		}
		if err := verifier.Verify(context.Background(), "cap-token"); err != nil {
			t.Fatalf("Verify returned error: %v", err)
		}
	})

	for name, tc := range map[string]struct {
		status int
		body   string
		want   error
	}{
		"rejected":  {http.StatusBadRequest, `{"success":false}`, ErrCaptchaInvalid},
		"server":    {http.StatusInternalServerError, `{"success":false}`, ErrCaptchaUnavailable},
		"malformed": {http.StatusOK, `not-json`, ErrCaptchaUnavailable},
	} {
		t.Run(name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer server.Close()

			verifier, err := NewCapVerifier(server.URL, "site-secret", time.Second)
			if err != nil {
				t.Fatalf("NewCapVerifier returned error: %v", err)
			}
			if err := verifier.Verify(context.Background(), "cap-token"); !errors.Is(err, tc.want) {
				t.Fatalf("Verify error = %v, want %v", err, tc.want)
			}
		})
	}
}

func TestCapVerifierTimeoutIsUnavailable(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		time.Sleep(50 * time.Millisecond)
		_, _ = w.Write([]byte(`{"success":true}`))
	}))
	defer server.Close()

	verifier, err := NewCapVerifier(server.URL, "site-secret", 5*time.Millisecond)
	if err != nil {
		t.Fatalf("NewCapVerifier returned error: %v", err)
	}
	if err := verifier.Verify(context.Background(), "cap-token"); !errors.Is(err, ErrCaptchaUnavailable) {
		t.Fatalf("Verify error = %v, want ErrCaptchaUnavailable", err)
	}
}
