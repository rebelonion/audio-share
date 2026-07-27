package services

import (
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestParseKeyPolicy(t *testing.T) {
	limits, err := ParseKeyPolicy("2/1m, 10/1h,20/24h")
	if err != nil {
		t.Fatalf("ParseKeyPolicy returned error: %v", err)
	}
	if len(limits) != 3 {
		t.Fatalf("got %d limits, want 3", len(limits))
	}
	if limits[0].Count != 2 || limits[0].Window != time.Minute {
		t.Fatalf("unexpected first limit: %#v", limits[0])
	}
	if limits[2].Count != 20 || limits[2].Window != 24*time.Hour {
		t.Fatalf("unexpected final limit: %#v", limits[2])
	}
}

func TestParseKeyPolicyRejectsInvalidValues(t *testing.T) {
	for _, value := range []string{"", "0/1m", "2/0s", "two/1m", "2/minute", "2/1m,"} {
		t.Run(value, func(t *testing.T) {
			if _, err := ParseKeyPolicy(value); err == nil {
				t.Fatalf("ParseKeyPolicy(%q) succeeded", value)
			}
		})
	}
}

func TestAccessKeyRoundTripAndScope(t *testing.T) {
	now := time.Date(2026, time.July, 26, 12, 0, 0, 0, time.UTC)
	manager := newTestAccessKeyManager(t, now)

	issued, err := manager.Issue("session-one", "192.0.2.1", "track-one", MediaPurposeStream)
	if err != nil {
		t.Fatalf("Issue returned error: %v", err)
	}
	if issued.ExpiresAt != now.Add(30*time.Minute) {
		t.Fatalf("ExpiresAt = %v, want %v", issued.ExpiresAt, now.Add(30*time.Minute))
	}
	if err := manager.Verify(issued.AccessKey, "session-one", "track-one", MediaPurposeStream); err != nil {
		t.Fatalf("Verify returned error: %v", err)
	}
	verified, err := manager.VerifyAndExtract(
		issued.AccessKey,
		"session-one",
		"track-one",
		MediaPurposeStream,
	)
	if err != nil {
		t.Fatalf("VerifyAndExtract returned error: %v", err)
	}
	if verified.Nonce == "" {
		t.Fatalf("unexpected verified access key: %#v", verified)
	}
	if !verified.ExpiresAt.Equal(issued.ExpiresAt) {
		t.Fatalf("verified expiry = %v, want %v", verified.ExpiresAt, issued.ExpiresAt)
	}

	for name, tc := range map[string]struct {
		sessionID string
		audioKey  string
		purpose   MediaPurpose
	}{
		"session": {"session-two", "track-one", MediaPurposeStream},
		"audio":   {"session-one", "track-two", MediaPurposeStream},
		"purpose": {"session-one", "track-one", MediaPurposeDownload},
	} {
		t.Run(name, func(t *testing.T) {
			if err := manager.Verify(issued.AccessKey, tc.sessionID, tc.audioKey, tc.purpose); !errors.Is(err, ErrInvalidAccessKey) {
				t.Fatalf("Verify error = %v, want ErrInvalidAccessKey", err)
			}
		})
	}
}

func TestAccessKeyNoncesAreUnique(t *testing.T) {
	now := time.Date(2026, time.July, 26, 12, 0, 0, 0, time.UTC)
	manager := newTestAccessKeyManager(t, now)

	first, err := manager.Issue("session-one", "192.0.2.1", "track-one", MediaPurposeStream)
	if err != nil {
		t.Fatalf("first Issue returned error: %v", err)
	}
	second, err := manager.Issue("session-one", "192.0.2.1", "track-one", MediaPurposeStream)
	if err != nil {
		t.Fatalf("second Issue returned error: %v", err)
	}
	firstVerified, _ := manager.VerifyAndExtract(
		first.AccessKey,
		"session-one",
		"track-one",
		MediaPurposeStream,
	)
	secondVerified, _ := manager.VerifyAndExtract(
		second.AccessKey,
		"session-one",
		"track-one",
		MediaPurposeStream,
	)
	if firstVerified.Nonce == secondVerified.Nonce {
		t.Fatal("separate access keys received the same nonce")
	}
}

func TestAccessKeyRejectsTamperingAndExpiration(t *testing.T) {
	now := time.Date(2026, time.July, 26, 12, 0, 0, 0, time.UTC)
	manager := newTestAccessKeyManager(t, now)
	issued, err := manager.Issue("session-one", "192.0.2.1", "track-one", MediaPurposeDownload)
	if err != nil {
		t.Fatalf("Issue returned error: %v", err)
	}

	if err := manager.Verify(issued.AccessKey+"x", "session-one", "track-one", MediaPurposeDownload); !errors.Is(err, ErrInvalidAccessKey) {
		t.Fatalf("tampered key error = %v, want ErrInvalidAccessKey", err)
	}

	manager.now = func() time.Time { return now.Add(10 * time.Minute) }
	if err := manager.Verify(issued.AccessKey, "session-one", "track-one", MediaPurposeDownload); !errors.Is(err, ErrExpiredAccessKey) {
		t.Fatalf("expired key error = %v, want ErrExpiredAccessKey", err)
	}
}

func TestAccessKeyManagerEnforcesEveryRollingWindow(t *testing.T) {
	now := time.Date(2026, time.July, 26, 12, 0, 0, 0, time.UTC)
	manager, err := NewAccessKeyManager(
		"test-secret",
		"2/1m,3/1h",
		"1/1m",
		30*time.Minute,
		10*time.Minute,
	)
	if err != nil {
		t.Fatalf("NewAccessKeyManager returned error: %v", err)
	}
	current := now
	manager.now = func() time.Time { return current }

	for range 2 {
		if _, err := manager.Issue("session-one", "192.0.2.1", "track-one", MediaPurposeStream); err != nil {
			t.Fatalf("Issue returned error: %v", err)
		}
	}
	if _, err := manager.Issue("session-one", "192.0.2.1", "track-one", MediaPurposeStream); err == nil {
		t.Fatal("third key inside minute was allowed")
	} else {
		var limited *KeyLimitExceededError
		if !errors.As(err, &limited) {
			t.Fatalf("error = %T %v, want KeyLimitExceededError", err, err)
		}
		if limited.RetryAfter != time.Minute {
			t.Fatalf("RetryAfter = %v, want 1m", limited.RetryAfter)
		}
	}

	current = current.Add(time.Minute)
	if _, err := manager.Issue("session-one", "192.0.2.1", "track-one", MediaPurposeStream); err != nil {
		t.Fatalf("key at minute boundary was rejected: %v", err)
	}
	if _, err := manager.Issue("session-one", "192.0.2.1", "track-two", MediaPurposeStream); err == nil {
		t.Fatal("fourth key inside hour was allowed")
	}

	if _, err := manager.Issue("session-two", "192.0.2.2", "track-one", MediaPurposeStream); err != nil {
		t.Fatalf("different session should have an independent limit: %v", err)
	}
	if _, err := manager.Issue("session-one", "192.0.2.1", "track-one", MediaPurposeDownload); err != nil {
		t.Fatalf("download purpose should have an independent limit: %v", err)
	}
}

func TestAccessKeyManagerEnforcesIPLimitAcrossSessions(t *testing.T) {
	now := time.Date(2026, time.July, 26, 12, 0, 0, 0, time.UTC)
	manager, err := NewAccessKeyManager(
		"test-secret",
		"1/1m",
		"1/1m",
		30*time.Minute,
		10*time.Minute,
	)
	if err != nil {
		t.Fatalf("NewAccessKeyManager returned error: %v", err)
	}
	manager.now = func() time.Time { return now }

	if _, err := manager.Issue("session-one", "192.0.2.1", "track-one", MediaPurposeStream); err != nil {
		t.Fatalf("first Issue returned error: %v", err)
	}
	if _, err := manager.Issue("session-two", "192.0.2.1", "track-two", MediaPurposeStream); err == nil {
		t.Fatal("same IP received another key through a fresh session")
	} else {
		var limited *KeyLimitExceededError
		if !errors.As(err, &limited) {
			t.Fatalf("error = %T %v, want KeyLimitExceededError", err, err)
		}
		if limited.Scope != KeyLimitScopeIP {
			t.Fatalf("limited scope = %q, want %q", limited.Scope, KeyLimitScopeIP)
		}
	}
	blockedSessionKey := accessIssuanceKey{
		scope:    KeyLimitScopeSession,
		identity: "session-two",
		purpose:  MediaPurposeStream,
	}
	if _, exists := manager.issuances[blockedSessionKey]; exists {
		t.Fatal("IP-blocked request retained an empty entry for the fresh session")
	}
	if _, err := manager.Issue("session-two", "192.0.2.2", "track-two", MediaPurposeStream); err != nil {
		t.Fatalf("different IP and session should have an independent limit: %v", err)
	}
}

func TestCaptchaPolicyRetainsEventsBeyondHardLimitWindow(t *testing.T) {
	current := time.Date(2026, time.July, 26, 12, 0, 0, 0, time.UTC)
	manager, err := NewAccessKeyManager(
		"test-secret",
		"100/1m",
		"10/1m",
		30*time.Minute,
		10*time.Minute,
	)
	if err != nil {
		t.Fatalf("NewAccessKeyManager returned error: %v", err)
	}
	if err := manager.SetCaptchaPolicy(MediaPurposeStream, "1/1h"); err != nil {
		t.Fatalf("SetCaptchaPolicy returned error: %v", err)
	}
	manager.now = func() time.Time { return current }

	if _, err := manager.Issue("session-one", "192.0.2.1", "track-one", MediaPurposeStream); err != nil {
		t.Fatalf("Issue returned error: %v", err)
	}
	current = current.Add(2 * time.Minute)
	if _, err := manager.Issue(
		"session-one",
		"192.0.2.1",
		"track-one",
		MediaPurposeStream,
	); !errors.Is(err, ErrCaptchaRequired) {
		t.Fatalf("Issue error = %v, want ErrCaptchaRequired", err)
	}
	current = current.Add(time.Hour)
	if _, err := manager.Issue("session-one", "192.0.2.1", "track-one", MediaPurposeStream); err != nil {
		t.Fatalf("Issue after CAPTCHA window returned error: %v", err)
	}
}

func TestAccessKeyManagerAtomicallyEnforcesCaptchaThreshold(t *testing.T) {
	manager, err := NewAccessKeyManager(
		"test-secret",
		"100/1h",
		"10/1m",
		30*time.Minute,
		10*time.Minute,
	)
	if err != nil {
		t.Fatalf("NewAccessKeyManager returned error: %v", err)
	}
	if err := manager.SetCaptchaPolicy(MediaPurposeStream, "1/1h"); err != nil {
		t.Fatalf("SetCaptchaPolicy returned error: %v", err)
	}
	manager.now = func() time.Time {
		return time.Date(2026, time.July, 26, 12, 0, 0, 0, time.UTC)
	}

	const requests = 32
	start := make(chan struct{})
	var successes atomic.Int64
	var challenged atomic.Int64
	var unexpected atomic.Int64
	var wg sync.WaitGroup
	wg.Add(requests)
	for range requests {
		go func() {
			defer wg.Done()
			<-start
			_, err := manager.Issue(
				"session-one",
				"192.0.2.1",
				"track-one",
				MediaPurposeStream,
			)
			switch {
			case err == nil:
				successes.Add(1)
			case errors.Is(err, ErrCaptchaRequired):
				challenged.Add(1)
			default:
				unexpected.Add(1)
			}
		}()
	}
	close(start)
	wg.Wait()

	if successes.Load() != 1 || challenged.Load() != requests-1 || unexpected.Load() != 0 {
		t.Fatalf(
			"successes=%d challenged=%d unexpected=%d",
			successes.Load(),
			challenged.Load(),
			unexpected.Load(),
		)
	}
}

func newTestAccessKeyManager(t *testing.T, now time.Time) *AccessKeyManager {
	t.Helper()
	manager, err := NewAccessKeyManager(
		"test-secret",
		"10/1m",
		"10/1m",
		30*time.Minute,
		10*time.Minute,
	)
	if err != nil {
		t.Fatalf("NewAccessKeyManager returned error: %v", err)
	}
	manager.now = func() time.Time { return now }
	return manager
}
