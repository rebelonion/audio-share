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

	ContentDir string

	StaticDir string

	NtfyURL      string
	NtfyTopic    string
	NtfyToken    string
	NtfyPriority int

	RateLimitWindow      int // milliseconds
	MaxRequestsPerWindow int
	AudioFileLimit       int
	ShareRequestLimit    int
	ShareLimitWindow     int // milliseconds
	ContactRequestLimit  int
	ContactLimitWindow   int // milliseconds

	CacheTTL int // seconds, 0 to disable

	DBPath        string
	IndexSchedule string

	UmamiURL string

	DefaultTitle       string
	DefaultDescription string
	UmamiWebsiteID     string
}

func Load() *Config {
	return &Config{
		Port:       getEnv("PORT", "8080"),
		AudioDir:   getEnv("AUDIO_DIR", ""),
		ContentDir: getEnv("CONTENT_DIR", "./content"),
		StaticDir:  getEnv("STATIC_DIR", "./static"),

		NtfyURL:      getEnv("NTFY_URL", "https://ntfy.sh"),
		NtfyTopic:    getEnv("NTFY_TOPIC", ""),
		NtfyToken:    getEnv("NTFY_TOKEN", ""),
		NtfyPriority: getEnvInt("NTFY_PRIORITY", 1),

		RateLimitWindow:      getEnvInt("RATE_LIMIT_WINDOW", 60000),
		MaxRequestsPerWindow: getEnvInt("MAX_REQUESTS_PER_WINDOW", 100),
		AudioFileLimit:       getEnvInt("AUDIO_FILE_LIMIT", 10),
		ShareRequestLimit:    getEnvInt("SHARE_REQUEST_LIMIT", 3),
		ShareLimitWindow:     getEnvInt("SHARE_LIMIT_WINDOW", 86400000),
		ContactRequestLimit:  getEnvInt("CONTACT_REQUEST_LIMIT", 5),
		ContactLimitWindow:   getEnvInt("CONTACT_LIMIT_WINDOW", 86400000),

		CacheTTL: getEnvInt("CACHE_TTL", 300),

		DBPath:        getEnv("DB_PATH", "./audio-share.db"),
		IndexSchedule: getEnv("INDEX_SCHEDULE", ""),

		UmamiURL: getEnv("UMAMI_URL", ""),
		UmamiWebsiteID:     getEnv("UMAMI_WEBSITE_ID", ""),
		DefaultTitle:       getEnv("DEFAULT_TITLE", "Audio Archive"),
		DefaultDescription: getEnv("DEFAULT_DESCRIPTION", "Browse and listen to audio files"),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
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

