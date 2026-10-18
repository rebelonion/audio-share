package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"
)

// Banner is the site-wide notice shown above every page.
type Banner struct {
	Message  string `json:"message"`
	Variant  string `json:"variant"`
	LinkText string `json:"linkText,omitempty"`
	LinkURL  string `json:"linkUrl,omitempty"`
}

const (
	maxBannerMessage  = 500
	maxBannerLinkText = 80
	maxBannerLinkURL  = 2000
	// Pages read the banner on every HTML response; other instances pick up
	// a change within this window.
	bannerCacheTTL = 15 * time.Second
	// Bounds the shared cache refresh, which no request context limits.
	bannerReadTimeout = 2 * time.Second
	// How long a page waits for the first read after startup.
	bannerColdWait = 250 * time.Millisecond
)

// BannerError is a validation failure whose message is safe to show to admins.
type BannerError struct{ msg string }

func (e *BannerError) Error() string { return e.msg }

// Normalize trims fields and validates them, returning a message suitable for
// the admin when the banner cannot be saved.
func (b Banner) Normalize() (Banner, error) {
	b.Message = strings.TrimSpace(b.Message)
	b.Variant = strings.TrimSpace(b.Variant)
	b.LinkText = strings.TrimSpace(b.LinkText)
	b.LinkURL = strings.TrimSpace(b.LinkURL)
	if b.Variant == "" {
		b.Variant = "info"
	}
	invalid := func(format string, args ...any) (Banner, error) {
		return Banner{}, &BannerError{fmt.Sprintf(format, args...)}
	}
	switch {
	case b.Message == "":
		return invalid("message is required")
	case utf8.RuneCountInString(b.Message) > maxBannerMessage:
		return invalid("message must be at most %d characters", maxBannerMessage)
	case b.Variant != "info" && b.Variant != "warning" && b.Variant != "success":
		return invalid("variant must be info, warning, or success")
	case bannerTokenError(b.Message) != "":
		return invalid("%s", bannerTokenError(b.Message))
	case (b.LinkText == "") != (b.LinkURL == ""):
		return invalid("link text and link URL must be set together")
	case utf8.RuneCountInString(b.LinkText) > maxBannerLinkText:
		return invalid("link text must be at most %d characters", maxBannerLinkText)
	case utf8.RuneCountInString(b.LinkURL) > maxBannerLinkURL:
		return invalid("link URL must be at most %d characters", maxBannerLinkURL)
	case b.LinkURL != "" && !validBannerLink(b.LinkURL):
		return invalid("link URL must be a site path like /requests or an http(s) URL")
	}
	return b, nil
}

// Placeholders the frontend fills in per visitor (lib/bannerTokens.ts), such as
// {countdown:2026-10-20T18:00Z|Live now}. Other braces are left as text.
var bannerTokenPattern = regexp.MustCompile(`\{(datetime|date|time|relative|countdown):([^{}]*)\}`)

// Timestamps need an explicit offset so every visitor reads the same moment.
var bannerTimestampLayouts = []string{time.RFC3339Nano, "2006-01-02T15:04Z07:00"}

// bannerTokenError describes the first malformed placeholder, or returns "".
func bannerTokenError(message string) string {
	for _, match := range bannerTokenPattern.FindAllStringSubmatch(message, -1) {
		kind, body := match[1], match[2]
		stamp, _, hasEnd := strings.Cut(body, "|")
		if hasEnd && kind != "countdown" {
			return fmt.Sprintf("%s: only countdowns take text after |", match[0])
		}
		if !validBannerTimestamp(strings.TrimSpace(stamp)) {
			return fmt.Sprintf("%s: use a time with a zone, like 2026-10-20T18:00Z or 2026-10-20T13:00-05:00", match[0])
		}
	}
	return ""
}

func validBannerTimestamp(value string) bool {
	upper := strings.ToUpper(value)
	for _, layout := range bannerTimestampLayouts {
		if _, err := time.Parse(layout, upper); err == nil {
			return true
		}
	}
	return false
}

func validBannerLink(link string) bool {
	// Browsers strip tabs and newlines from URLs and treat backslashes as
	// slashes, so "/\t/evil.example" or "/\\evil.example" would leave the site.
	if strings.ContainsFunc(link, func(r rune) bool { return unicode.IsSpace(r) || unicode.IsControl(r) || r == '\\' }) {
		return false
	}
	parsed, err := url.Parse(link)
	if err != nil {
		return false
	}
	if strings.HasPrefix(link, "/") {
		return parsed.Scheme == "" && parsed.Host == "" && !strings.HasPrefix(link, "//")
	}
	return (parsed.Scheme == "http" || parsed.Scheme == "https") && parsed.Host != ""
}

// BannerStore persists the banner and caches it briefly for page renders.
type BannerStore struct {
	db       *sql.DB
	now      func() time.Time
	load     func(context.Context) (*Banner, error)
	coldWait time.Duration

	mu         sync.Mutex
	cached     *Banner
	fetchedAt  time.Time
	inflight   *bannerRead
	generation int
}

// bannerRead is a cache refresh shared by every caller that needs it.
type bannerRead struct {
	done   chan struct{}
	banner *Banner
	err    error
}

func NewBannerStore(db *sql.DB) *BannerStore {
	s := &BannerStore{db: db, now: time.Now, coldWait: bannerColdWait}
	s.load = s.Get
	return s
}

// Get reads the current banner from the database; nil means none is set.
func (s *BannerStore) Get(ctx context.Context) (*Banner, error) {
	var b Banner
	err := s.db.QueryRowContext(ctx, `SELECT message, variant, link_text, link_url FROM site_banner`).
		Scan(&b.Message, &b.Variant, &b.LinkText, &b.LinkURL)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &b, nil
}

// Current returns the banner for page renders, served from a short cache.
// An expired cache is refreshed by one shared read that is detached from any
// visitor's request, so a disconnecting visitor cannot fail it. While it runs,
// callers get the previous value; only before the first successful load do
// they wait for it. A failed read keeps the last known banner and is not
// retried until the cache window passes, so an unavailable database does not
// stall pages.
func (s *BannerStore) Current(ctx context.Context) (*Banner, error) {
	s.mu.Lock()
	if !s.fetchedAt.IsZero() && s.now().Sub(s.fetchedAt) < bannerCacheTTL {
		b := s.cached
		s.mu.Unlock()
		return b, nil
	}
	read := s.inflight
	if read == nil {
		read = &bannerRead{done: make(chan struct{})}
		s.inflight = read
		go s.refresh(read, s.generation)
	}
	loaded, stale := !s.fetchedAt.IsZero(), s.cached
	s.mu.Unlock()
	if loaded {
		return stale, nil
	}
	// The banner is optional: wait briefly so it shows right after startup,
	// but never hold a page on a slow database.
	timer := time.NewTimer(s.coldWait)
	defer timer.Stop()
	select {
	case <-read.done:
		return read.banner, read.err
	case <-timer.C:
		return nil, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func (s *BannerStore) refresh(read *bannerRead, generation int) {
	var b *Banner
	var err error
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("banner read panicked: %v", r)
		}
		s.mu.Lock()
		s.inflight = nil
		// A Set or Clear during the read already stored a newer value.
		if s.generation == generation {
			s.fetchedAt = s.now()
			if err == nil {
				s.cached = b
			}
		} else {
			err = nil
		}
		read.banner, read.err = s.cached, err
		s.mu.Unlock()
		close(read.done)
	}()
	ctx, cancel := context.WithTimeout(context.Background(), bannerReadTimeout)
	defer cancel()
	b, err = s.load(ctx)
}

// Set validates and stores the banner, replacing any existing one.
func (s *BannerStore) Set(ctx context.Context, b Banner) (*Banner, error) {
	b, err := b.Normalize()
	if err != nil {
		return nil, err
	}
	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO site_banner (id, message, variant, link_text, link_url, updated_at)
		VALUES (TRUE, $1, $2, $3, $4, NOW())
		ON CONFLICT (id) DO UPDATE SET message = excluded.message, variant = excluded.variant,
			link_text = excluded.link_text, link_url = excluded.link_url, updated_at = excluded.updated_at
	`, b.Message, b.Variant, b.LinkText, b.LinkURL); err != nil {
		return nil, err
	}
	s.store(&b)
	return &b, nil
}

// Clear removes the banner.
func (s *BannerStore) Clear(ctx context.Context) error {
	if _, err := s.db.ExecContext(ctx, `DELETE FROM site_banner`); err != nil {
		return err
	}
	s.store(nil)
	return nil
}

func (s *BannerStore) store(b *Banner) {
	s.mu.Lock()
	s.cached, s.fetchedAt = b, s.now()
	s.generation++
	s.mu.Unlock()
}
