package services

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

type NtfyService struct {
	url      string
	topic    string
	token    string
	priority int
}

func NewNtfyService(url, topic, token string, priority int) *NtfyService {
	return &NtfyService{
		url:      url,
		topic:    topic,
		token:    token,
		priority: priority,
	}
}

func (n *NtfyService) IsConfigured() bool {
	return n.topic != ""
}

func (n *NtfyService) SendShareNotification(requestURL string) error {
	if !n.IsConfigured() {
		return fmt.Errorf("ntfy not configured")
	}

	body := fmt.Sprintf("New source request: %s", requestURL)
	return n.send(body, "New Audio Source Request", "audio,request,source")
}

func (n *NtfyService) SendContactNotification(topic, email, message string) error {
	if !n.IsConfigured() {
		return fmt.Errorf("ntfy not configured")
	}

	topicLabels := map[string]string{
		"general": "General Question",
		"bug":     "Bug Report",
		"feature": "Feature Request",
		"content": "Content Issue",
		"other":   "Other",
	}

	topicLabel := topic
	if label, ok := topicLabels[topic]; ok {
		topicLabel = label
	}

	emailInfo := "Not provided"
	if email != "" {
		emailInfo = email
	}

	body := fmt.Sprintf("Topic: %s\nEmail: %s\n\nMessage:\n%s", topicLabel, emailInfo, message)
	return n.send(body, "New Contact Form Submission", "contact,message,form")
}

func (n *NtfyService) send(body, title, tags string) error {
	endpoint := fmt.Sprintf("%s/%s", n.url, n.topic)

	req, err := http.NewRequest("POST", endpoint, strings.NewReader(body))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "text/plain")
	req.Header.Set("X-Title", title)
	req.Header.Set("X-Priority", strconv.Itoa(n.priority))
	req.Header.Set("X-Tags", tags)

	if n.token != "" {
		req.Header.Set("Authorization", "Bearer "+n.token)
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("ntfy returned status %d", resp.StatusCode)
	}

	return nil
}
