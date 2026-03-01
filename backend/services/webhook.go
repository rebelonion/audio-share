package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type WebhookService struct {
	url   string
	token string
}

type NewFolder struct {
	ShareKey    string `json:"shareKey"`
	Name        string `json:"name"`
	OriginalURL string `json:"originalUrl"`
}

type IndexCompletePayload struct {
	Event      string      `json:"event"`
	Timestamp  string      `json:"timestamp"`
	Stats      IndexStats  `json:"stats"`
	NewFolders []NewFolder `json:"newFolders"`
}

type IndexStats struct {
	Duration string `json:"duration"`
}

func NewWebhookService(url, token string) *WebhookService {
	return &WebhookService{
		url:   url,
		token: token,
	}
}

func (w *WebhookService) IsConfigured() bool {
	return w.url != ""
}

func (w *WebhookService) SendIndexComplete(duration time.Duration, newFolders []NewFolder) error {
	if !w.IsConfigured() {
		return nil
	}

	payload := IndexCompletePayload{
		Event:      "index_complete",
		Timestamp:  time.Now().UTC().Format(time.RFC3339),
		Stats:      IndexStats{Duration: duration.String()},
		NewFolders: newFolders,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}

	req, err := http.NewRequest("POST", w.url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if w.token != "" {
		req.Header.Set("Authorization", "Bearer "+w.token)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send webhook: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("webhook returned status %d", resp.StatusCode)
	}

	return nil
}
