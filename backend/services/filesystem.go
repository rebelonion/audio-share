package services

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

type AudioDirConfig struct {
	Path string
	Name string
	Slug string
}

type FolderMetadata struct {
	FolderName    string `json:"folder_name"`
	Name          string `json:"name"`
	OriginalURL   string `json:"original_url,omitempty"`
	URLBroken     bool   `json:"url_broken,omitempty"`
	Items         int    `json:"items,omitempty"`
	DirectorySize string `json:"directory_size,omitempty"`
	Description   string `json:"description,omitempty"`
}

type FileSystemItem struct {
	Name        string          `json:"name"`
	Path        string          `json:"path"`
	Size        int64           `json:"size,omitempty"`
	ModifiedAt  string          `json:"modifiedAt"`
	Type        string          `json:"type"`
	MimeType    string          `json:"mimeType,omitempty"`
	Metadata    *FolderMetadata `json:"metadata,omitempty"`
	PosterImage string          `json:"posterImage,omitempty"`
	ShareKey    string          `json:"shareKey,omitempty"`
}

type DirectoryContents struct {
	Items       []FileSystemItem `json:"items"`
	CurrentPath string           `json:"currentPath"`
}

type FileSystemService struct {
	audioDirs   []AudioDirConfig
	slugToDir   map[string]AudioDirConfig
	audioExts   map[string]string
	posterNames []string
}

func NewFileSystemService(audioDirEnv string) *FileSystemService {
	fs := &FileSystemService{
		slugToDir: make(map[string]AudioDirConfig),
		audioExts: map[string]string{
			".mp3":  "audio/mpeg",
			".wav":  "audio/wav",
			".ogg":  "audio/ogg",
			".flac": "audio/flac",
			".aac":  "audio/aac",
			".m4a":  "audio/mp4",
			".opus": "audio/opus",
		},
		posterNames: []string{"poster.jpg", "artist.jpg", "cover.jpg", "album.jpg"},
	}

	fs.audioDirs = fs.parseAudioDirs(audioDirEnv)
	for _, dir := range fs.audioDirs {
		fs.slugToDir[dir.Slug] = dir
	}

	return fs
}

func (fs *FileSystemService) parseAudioDirs(audioDirEnv string) []AudioDirConfig {
	existingSlugs := make(map[string]bool)

	if audioDirEnv == "" {
		cwd, _ := os.Getwd()
		defaultDir := filepath.Join(cwd, "public", "audio")
		slug := "audio"
		existingSlugs[slug] = true
		return []AudioDirConfig{{Path: defaultDir, Name: "Audio", Slug: slug}}
	}

	var configs []AudioDirConfig
	for _, dirConfig := range strings.Split(audioDirEnv, ",") {
		dirConfig = strings.TrimSpace(dirConfig)
		if dirConfig == "" {
			continue
		}

		parts := strings.SplitN(dirConfig, ":", 2)
		var dirPath, name string

		if len(parts) > 1 && strings.TrimSpace(parts[0]) != "" {
			dirPath = strings.TrimSpace(parts[0])
			name = strings.TrimSpace(parts[1])
			if name == "" {
				name = filepath.Base(dirPath)
			}
		} else if strings.TrimSpace(parts[0]) != "" {
			dirPath = strings.TrimSpace(parts[0])
			name = filepath.Base(dirPath)
		} else {
			continue
		}

		slug := fs.createUniqueSlug(name, existingSlugs)
		existingSlugs[slug] = true
		configs = append(configs, AudioDirConfig{Path: dirPath, Name: name, Slug: slug})
	}

	if len(configs) == 0 {
		cwd, _ := os.Getwd()
		defaultDir := filepath.Join(cwd, "public", "audio")
		return []AudioDirConfig{{Path: defaultDir, Name: "Audio", Slug: "audio"}}
	}

	return configs
}

func (fs *FileSystemService) slugify(name string) string {
	slug := strings.ToLower(name)
	slug = regexp.MustCompile(`\s+`).ReplaceAllString(slug, "-")
	slug = regexp.MustCompile(`[^a-z0-9\-]`).ReplaceAllString(slug, "")
	slug = regexp.MustCompile(`-+`).ReplaceAllString(slug, "-")
	slug = strings.Trim(slug, "-")
	if slug == "" {
		slug = "audio"
	}
	return slug
}

func (fs *FileSystemService) createUniqueSlug(name string, existing map[string]bool) string {
	slug := fs.slugify(name)
	uniqueSlug := slug
	counter := 1

	for existing[uniqueSlug] {
		uniqueSlug = slug + "-" + string(rune('0'+counter))
		counter++
	}

	return uniqueSlug
}

func (fs *FileSystemService) GetSlugToDirectoryMap() map[string]AudioDirConfig {
	return fs.slugToDir
}


func (fs *FileSystemService) ValidatePath(slug, relativePath string) (string, bool) {
	dirConfig, ok := fs.slugToDir[slug]
	if !ok {
		return "", false
	}

	normalizedPath := filepath.Clean(relativePath)
	if strings.HasPrefix(normalizedPath, "..") || filepath.IsAbs(normalizedPath) {
		return "", false
	}

	fullPath := filepath.Join(dirConfig.Path, normalizedPath)

	absPath, err := filepath.Abs(fullPath)
	if err != nil {
		return "", false
	}
	absDir, err := filepath.Abs(dirConfig.Path)
	if err != nil {
		return "", false
	}
	if !strings.HasPrefix(absPath, absDir) {
		return "", false
	}

	return fullPath, true
}
