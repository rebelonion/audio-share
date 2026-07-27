package services

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"
)

type MediaPurpose string

const (
	MediaPurposeStream   MediaPurpose = "stream"
	MediaPurposeDownload MediaPurpose = "download"
)

var (
	ErrInvalidAccessKey = errors.New("invalid access key")
	ErrExpiredAccessKey = errors.New("expired access key")
)

type KeyLimit struct {
	Count  int
	Window time.Duration
}

type KeyLimitScope string

const (
	KeyLimitScopeSession KeyLimitScope = "session"
	KeyLimitScopeIP      KeyLimitScope = "ip"
)

type KeyLimitExceededError struct {
	Purpose    MediaPurpose
	Scope      KeyLimitScope
	Limit      KeyLimit
	RetryAfter time.Duration
}

func (e *KeyLimitExceededError) Error() string {
	return fmt.Sprintf(
		"%s key limit of %d per %s exceeded for %s",
		e.Purpose,
		e.Limit.Count,
		e.Limit.Window,
		e.Scope,
	)
}

type IssuedAccessKey struct {
	AccessKey string
	ExpiresAt time.Time
}

type accessKeyClaims struct {
	Version        int          `json:"v"`
	AudioKey       string       `json:"a"`
	SessionBinding string       `json:"s"`
	Purpose        MediaPurpose `json:"p"`
	IssuedAt       int64        `json:"iat"`
	ExpiresAt      int64        `json:"exp"`
	Nonce          string       `json:"n"`
}

type AccessKeyManager struct {
	secret   []byte
	policies map[MediaPurpose][]KeyLimit
	ttls     map[MediaPurpose]time.Duration
	now      func() time.Time

	mu                    sync.Mutex
	issuances             map[accessIssuanceKey][]time.Time
	issuancesSinceCleanup int
}

type accessIssuanceKey struct {
	scope    KeyLimitScope
	identity string
	purpose  MediaPurpose
}

func ParseKeyPolicy(raw string) ([]KeyLimit, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, errors.New("key policy cannot be empty")
	}

	parts := strings.Split(raw, ",")
	limits := make([]KeyLimit, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		segments := strings.Split(part, "/")
		if len(segments) != 2 || strings.TrimSpace(segments[0]) == "" || strings.TrimSpace(segments[1]) == "" {
			return nil, fmt.Errorf("invalid key limit %q", part)
		}
		count, err := strconv.Atoi(strings.TrimSpace(segments[0]))
		if err != nil || count <= 0 {
			return nil, fmt.Errorf("invalid key count in %q", part)
		}
		window, err := time.ParseDuration(strings.TrimSpace(segments[1]))
		if err != nil || window <= 0 {
			return nil, fmt.Errorf("invalid key window in %q", part)
		}
		limits = append(limits, KeyLimit{Count: count, Window: window})
	}
	return limits, nil
}

func NewAccessKeyManager(
	secret string,
	streamPolicy string,
	downloadPolicy string,
	streamTTL time.Duration,
	downloadTTL time.Duration,
) (*AccessKeyManager, error) {
	if secret == "" {
		return nil, errors.New("access key secret cannot be empty")
	}
	if streamTTL <= 0 || downloadTTL <= 0 {
		return nil, errors.New("access key TTLs must be positive")
	}
	streamLimits, err := ParseKeyPolicy(streamPolicy)
	if err != nil {
		return nil, fmt.Errorf("stream key limits: %w", err)
	}
	downloadLimits, err := ParseKeyPolicy(downloadPolicy)
	if err != nil {
		return nil, fmt.Errorf("download key limits: %w", err)
	}

	return &AccessKeyManager{
		secret: []byte(secret),
		policies: map[MediaPurpose][]KeyLimit{
			MediaPurposeStream:   streamLimits,
			MediaPurposeDownload: downloadLimits,
		},
		ttls: map[MediaPurpose]time.Duration{
			MediaPurposeStream:   streamTTL,
			MediaPurposeDownload: downloadTTL,
		},
		now:       time.Now,
		issuances: make(map[accessIssuanceKey][]time.Time),
	}, nil
}

func (m *AccessKeyManager) Issue(
	sessionID string,
	clientIP string,
	audioKey string,
	purpose MediaPurpose,
) (IssuedAccessKey, error) {
	ttl, ok := m.ttls[purpose]
	if !ok || sessionID == "" || clientIP == "" || audioKey == "" {
		return IssuedAccessKey{}, ErrInvalidAccessKey
	}

	now := m.now()
	nonceBytes := make([]byte, 16)
	if _, err := rand.Read(nonceBytes); err != nil {
		return IssuedAccessKey{}, fmt.Errorf("generate access key nonce: %w", err)
	}
	expiresAt := now.Add(ttl)
	claims := accessKeyClaims{
		Version:        1,
		AudioKey:       audioKey,
		SessionBinding: m.sessionBinding(sessionID),
		Purpose:        purpose,
		IssuedAt:       now.UnixMilli(),
		ExpiresAt:      expiresAt.UnixMilli(),
		Nonce:          base64.RawURLEncoding.EncodeToString(nonceBytes),
	}
	token, err := m.signClaims(claims)
	if err != nil {
		return IssuedAccessKey{}, err
	}
	if err := m.recordIssuance(sessionID, clientIP, purpose, now); err != nil {
		return IssuedAccessKey{}, err
	}
	return IssuedAccessKey{AccessKey: token, ExpiresAt: expiresAt}, nil
}

func (m *AccessKeyManager) Verify(token, sessionID, audioKey string, purpose MediaPurpose) error {
	if token == "" || sessionID == "" || audioKey == "" {
		return ErrInvalidAccessKey
	}
	claims, err := m.verifyClaims(token)
	if err != nil {
		return err
	}
	if claims.Version != 1 ||
		claims.AudioKey != audioKey ||
		claims.Purpose != purpose ||
		claims.SessionBinding != m.sessionBinding(sessionID) ||
		claims.IssuedAt <= 0 ||
		claims.ExpiresAt <= claims.IssuedAt ||
		claims.Nonce == "" {
		return ErrInvalidAccessKey
	}
	if !m.now().Before(time.UnixMilli(claims.ExpiresAt)) {
		return ErrExpiredAccessKey
	}
	return nil
}

func (m *AccessKeyManager) recordIssuance(
	sessionID string,
	clientIP string,
	purpose MediaPurpose,
	now time.Time,
) error {
	limits := m.policies[purpose]
	keys := []accessIssuanceKey{
		{scope: KeyLimitScopeSession, identity: sessionID, purpose: purpose},
		{scope: KeyLimitScopeIP, identity: clientIP, purpose: purpose},
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	eventsByKey := make(map[accessIssuanceKey][]time.Time, len(keys))
	var blocked *KeyLimitExceededError
	for _, key := range keys {
		events := pruneIssuances(m.issuances[key], now, longestWindow(limits))
		eventsByKey[key] = events
		for _, limit := range limits {
			first := firstWithinWindow(events, now, limit.Window)
			count := len(events) - first
			if count < limit.Count {
				continue
			}
			retryAfter := events[first].Add(limit.Window).Sub(now)
			if blocked == nil || retryAfter > blocked.RetryAfter {
				blocked = &KeyLimitExceededError{
					Purpose:    purpose,
					Scope:      key.scope,
					Limit:      limit,
					RetryAfter: retryAfter,
				}
			}
		}
	}
	if blocked != nil {
		for key, events := range eventsByKey {
			if len(events) == 0 {
				delete(m.issuances, key)
			} else {
				m.issuances[key] = events
			}
		}
		return blocked
	}

	for key, events := range eventsByKey {
		m.issuances[key] = append(events, now)
	}
	m.issuancesSinceCleanup++
	if m.issuancesSinceCleanup >= 256 {
		m.cleanupLocked(now)
		m.issuancesSinceCleanup = 0
	}
	return nil
}

func (m *AccessKeyManager) cleanupLocked(now time.Time) {
	for key, events := range m.issuances {
		events = pruneIssuances(events, now, longestWindow(m.policies[key.purpose]))
		if len(events) == 0 {
			delete(m.issuances, key)
		} else {
			m.issuances[key] = events
		}
	}
}

func pruneIssuances(events []time.Time, now time.Time, window time.Duration) []time.Time {
	first := firstWithinWindow(events, now, window)
	if first >= len(events) {
		return nil
	}
	return events[first:]
}

func firstWithinWindow(events []time.Time, now time.Time, window time.Duration) int {
	first := 0
	for first < len(events) && !events[first].Add(window).After(now) {
		first++
	}
	return first
}

func longestWindow(limits []KeyLimit) time.Duration {
	var longest time.Duration
	for _, limit := range limits {
		if limit.Window > longest {
			longest = limit.Window
		}
	}
	return longest
}

func (m *AccessKeyManager) sessionBinding(sessionID string) string {
	mac := hmac.New(sha256.New, m.secret)
	mac.Write([]byte("audio-access-session\x00"))
	mac.Write([]byte(sessionID))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (m *AccessKeyManager) signClaims(claims accessKeyClaims) (string, error) {
	payload, err := json.Marshal(claims)
	if err != nil {
		return "", fmt.Errorf("encode access key: %w", err)
	}
	encoded := base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, m.secret)
	mac.Write([]byte("audio-access-key\x00"))
	mac.Write([]byte(encoded))
	signature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return encoded + "." + signature, nil
}

func (m *AccessKeyManager) verifyClaims(token string) (accessKeyClaims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return accessKeyClaims{}, ErrInvalidAccessKey
	}

	mac := hmac.New(sha256.New, m.secret)
	mac.Write([]byte("audio-access-key\x00"))
	mac.Write([]byte(parts[0]))
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || !hmac.Equal(signature, mac.Sum(nil)) {
		return accessKeyClaims{}, ErrInvalidAccessKey
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return accessKeyClaims{}, ErrInvalidAccessKey
	}
	var claims accessKeyClaims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return accessKeyClaims{}, ErrInvalidAccessKey
	}
	return claims, nil
}
