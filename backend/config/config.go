package config

import (
	"bufio"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

func init() {
	loadEnvFile(".env.local")
	loadEnvFile(".env")
}

func loadEnvFile(filename string) {
	paths := []string{
		filename,
		filepath.Join("..", filename),
	}

	for _, path := range paths {
		file, err := os.Open(path)
		if err != nil {
			continue
		}
		defer file.Close()

		scanner := bufio.NewScanner(file)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			parts := strings.SplitN(line, "=", 2)
			if len(parts) != 2 {
				continue
			}
			key := strings.TrimSpace(parts[0])
			value := strings.TrimSpace(parts[1])
			if len(value) >= 2 {
				if (value[0] == '"' && value[len(value)-1] == '"') ||
					(value[0] == '\'' && value[len(value)-1] == '\'') {
					value = value[1 : len(value)-1]
				}
			}
			// Only set if not already set (env vars take precedence)
			if os.Getenv(key) == "" {
				os.Setenv(key, value)
			}
		}
		break
	}
}

type Config struct {
	Port string

	AudioDir string

	StreamBytesPerSecond     int64
	StreamBurstBytes         int64
	DownloadBytesPerSecond   int64
	DownloadBurstBytes       int64
	StreamIPBytesPerSecond   int64
	DownloadIPBytesPerSecond int64

	StreamKeyLimits       string
	DownloadKeyLimits     string
	StreamKeyTTL          string
	DownloadKeyTTL        string
	DownloadSessionMinAge string

	CapEnforcement            string
	CapPublicEndpoint         string
	CapVerifyEndpoint         string
	CapSecretKey              string
	CapVerifyTimeout          string
	StreamCaptchaLimits       string
	StreamCaptchaClearanceTTL string
	DownloadCaptchaMode       string

	ContentDir string

	StaticDir string

	NtfyURL       string
	NtfyTopic     string
	NtfyToken     string
	NtfyPriority  int
	NtfyReviewURL string

	SourceNormalizerScript  string
	SourceNormalizerTimeout string

	RateLimitWindow      int // milliseconds
	MaxRequestsPerWindow int
	ImageRateLimitWindow int // milliseconds
	MaxImagesPerWindow   int
	ShareRequestLimit    int
	ShareLimitWindow     int // milliseconds
	ContactRequestLimit  int
	ContactLimitWindow   int // milliseconds

	DatabaseURL   string
	IndexSchedule string

	RybbitURL    string
	RybbitSiteID string

	DefaultTitle       string
	DefaultDescription string
	BannerMessage      string
	BannerVariant      string
	BannerLinkText     string
	BannerLinkURL      string

	SessionSecret string

	RequestsAPIKey    string
	IndexWebhookURL   string
	IndexWebhookToken string

	CORSOrigins []string

	WaveformCron        string
	WaveformMaxDuration string
	WaveformWorkers     int
}

func Load() *Config {
	return &Config{
		Port:                      getEnv("PORT", "8080"),
		AudioDir:                  getEnv("AUDIO_DIR", ""),
		StreamBytesPerSecond:      getEnvInt64("STREAM_BYTES_PER_SECOND", 0),
		StreamBurstBytes:          getEnvInt64("STREAM_BURST_BYTES", 0),
		DownloadBytesPerSecond:    getEnvInt64("DOWNLOAD_BYTES_PER_SECOND", 0),
		DownloadBurstBytes:        getEnvInt64("DOWNLOAD_BURST_BYTES", 0),
		StreamIPBytesPerSecond:    getEnvInt64("STREAM_IP_BYTES_PER_SECOND", 0),
		DownloadIPBytesPerSecond:  getEnvInt64("DOWNLOAD_IP_BYTES_PER_SECOND", 0),
		StreamKeyLimits:           getEnv("STREAM_KEY_LIMITS", "10/1m"),
		DownloadKeyLimits:         getEnv("DOWNLOAD_KEY_LIMITS", "10/1m"),
		StreamKeyTTL:              getEnv("STREAM_KEY_TTL", "30m"),
		DownloadKeyTTL:            getEnv("DOWNLOAD_KEY_TTL", "10m"),
		DownloadSessionMinAge:     getEnv("DOWNLOAD_SESSION_MIN_AGE", "0s"),
		CapEnforcement:            getEnv("CAP_ENFORCEMENT", "off"),
		CapPublicEndpoint:         getEnv("CAP_PUBLIC_ENDPOINT", ""),
		CapVerifyEndpoint:         getEnv("CAP_VERIFY_ENDPOINT", ""),
		CapSecretKey:              getEnv("CAP_SECRET_KEY", ""),
		CapVerifyTimeout:          getEnv("CAP_VERIFY_TIMEOUT", "3s"),
		StreamCaptchaLimits:       getEnv("STREAM_CAPTCHA_LIMITS", ""),
		StreamCaptchaClearanceTTL: getEnv("STREAM_CAPTCHA_CLEARANCE_TTL", "15m"),
		DownloadCaptchaMode:       getEnv("DOWNLOAD_CAPTCHA_MODE", "always"),
		ContentDir:                getEnv("CONTENT_DIR", "./content"),
		StaticDir:                 getEnv("STATIC_DIR", "./static"),

		NtfyURL:       getEnv("NTFY_URL", "https://ntfy.sh"),
		NtfyTopic:     getEnv("NTFY_TOPIC", ""),
		NtfyToken:     getEnv("NTFY_TOKEN", ""),
		NtfyPriority:  getEnvInt("NTFY_PRIORITY", 1),
		NtfyReviewURL: getEnv("NTFY_REVIEW_URL", ""),

		SourceNormalizerScript:  getEnv("SOURCE_NORMALIZER_SCRIPT", ""),
		SourceNormalizerTimeout: getEnv("SOURCE_NORMALIZER_TIMEOUT", "15s"),

		RateLimitWindow:      getEnvInt("RATE_LIMIT_WINDOW", 60000),
		MaxRequestsPerWindow: getEnvInt("MAX_REQUESTS_PER_WINDOW", 100),
		ImageRateLimitWindow: getEnvInt("IMAGE_RATE_LIMIT_WINDOW", 60000),
		MaxImagesPerWindow:   getEnvInt("MAX_IMAGES_PER_WINDOW", 300),
		ShareRequestLimit:    getEnvInt("SHARE_REQUEST_LIMIT", 3),
		ShareLimitWindow:     getEnvInt("SHARE_LIMIT_WINDOW", 86400000),
		ContactRequestLimit:  getEnvInt("CONTACT_REQUEST_LIMIT", 5),
		ContactLimitWindow:   getEnvInt("CONTACT_LIMIT_WINDOW", 86400000),

		DatabaseURL:   getEnv("DATABASE_URL", "postgres://audio_share:audio_share@localhost:5432/audio_share"),
		IndexSchedule: getEnv("INDEX_SCHEDULE", ""),

		RybbitURL:          getEnv("RYBBIT_URL", ""),
		RybbitSiteID:       getEnv("RYBBIT_SITE_ID", ""),
		DefaultTitle:       getEnv("DEFAULT_TITLE", "Audio Archive"),
		DefaultDescription: getEnv("DEFAULT_DESCRIPTION", "Browse and listen to audio files"),
		BannerMessage:      getEnv("BANNER_MESSAGE", ""),
		BannerVariant:      getEnv("BANNER_VARIANT", "info"),
		BannerLinkText:     getEnv("BANNER_LINK_TEXT", ""),
		BannerLinkURL:      getEnv("BANNER_LINK_URL", ""),

		SessionSecret: getEnv("SESSION_SECRET", ""),

		RequestsAPIKey:    getEnv("REQUESTS_API_KEY", ""),
		IndexWebhookURL:   getEnv("INDEX_WEBHOOK_URL", ""),
		IndexWebhookToken: getEnv("INDEX_WEBHOOK_TOKEN", ""),

		CORSOrigins: getEnvList("CORS_ORIGINS", []string{"http://localhost:5173"}),

		WaveformCron:        getEnv("WAVEFORM_CRON", ""),
		WaveformMaxDuration: getEnv("WAVEFORM_MAX_DURATION", "2h"),
		WaveformWorkers:     getEnvInt("WAVEFORM_WORKERS", 1),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvList(key string, defaultValue []string) []string {
	if value := os.Getenv(key); value != "" {
		var result []string
		for _, item := range strings.Split(value, ",") {
			if trimmed := strings.TrimSpace(item); trimmed != "" {
				result = append(result, trimmed)
			}
		}
		return result
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}

func getEnvInt64(key string, defaultValue int64) int64 {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.ParseInt(value, 10, 64); err == nil {
			return intValue
		}
	}
	return defaultValue
}
