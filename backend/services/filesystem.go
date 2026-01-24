package services

import (
	"encoding/json"
	"math/rand"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
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
}

type DirectoryContents struct {
	Items       []FileSystemItem `json:"items"`
	CurrentPath string           `json:"currentPath"`
}

type cacheEntry struct {
	contents  *DirectoryContents
	timestamp int64
}

type FileSystemService struct {
	audioDirs   []AudioDirConfig
	slugToDir   map[string]AudioDirConfig
	audioExts   map[string]string
	posterNames []string
	cacheTTL    int64
	cache       map[string]*cacheEntry
	cacheMu     sync.RWMutex
}

func NewFileSystemService(audioDirEnv string, cacheTTL int) *FileSystemService {
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
		cacheTTL:    int64(cacheTTL),
		cache:       make(map[string]*cacheEntry),
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

func (fs *FileSystemService) GetDirectoryContents(dirPath string) (*DirectoryContents, error) {
	now := time.Now().Unix()

	if fs.cacheTTL > 0 {
		fs.cacheMu.RLock()
		if entry, ok := fs.cache[dirPath]; ok && now-entry.timestamp < fs.cacheTTL {
			fs.cacheMu.RUnlock()
			return entry.contents, nil
		}
		fs.cacheMu.RUnlock()
	}

	items := []FileSystemItem{}

	if dirPath == "" {
		for _, dirConfig := range fs.audioDirs {
			info, err := os.Stat(dirConfig.Path)
			if err != nil {
				continue
			}
			if info.IsDir() {
				items = append(items, FileSystemItem{
					Name:       dirConfig.Name,
					Path:       dirConfig.Slug,
					ModifiedAt: info.ModTime().Format("2006-01-02T15:04:05.000Z"),
					Type:       "folder",
				})
			}
		}
		sort.Slice(items, func(i, j int) bool {
			return items[i].Name < items[j].Name
		})
		return &DirectoryContents{Items: items, CurrentPath: dirPath}, nil
	}

	pathParts := strings.Split(dirPath, "/")
	dirSlug := pathParts[0]

	dirConfig, ok := fs.slugToDir[dirSlug]
	if !ok {
		return &DirectoryContents{Items: items, CurrentPath: dirPath}, nil
	}

	relativePath := ""
	if len(pathParts) > 1 {
		relativePath = strings.Join(pathParts[1:], "/")
	}

	normalizedPath := filepath.Clean(relativePath)
	if strings.HasPrefix(normalizedPath, "..") || filepath.IsAbs(normalizedPath) {
		return &DirectoryContents{Items: items, CurrentPath: dirPath}, nil
	}

	fullPath := filepath.Join(dirConfig.Path, normalizedPath)

	entries, err := os.ReadDir(fullPath)
	if err != nil {
		return &DirectoryContents{Items: items, CurrentPath: dirPath}, nil
	}

	var folderMetadataList []FolderMetadata
	metadataPath := filepath.Join(fullPath, "folder.json")
	if data, err := os.ReadFile(metadataPath); err == nil {
		json.Unmarshal(data, &folderMetadataList)
	}

	metadataMap := make(map[string]FolderMetadata)
	for _, m := range folderMetadataList {
		metadataMap[m.FolderName] = m
	}

	for _, entry := range entries {
		name := entry.Name()
		if strings.HasPrefix(name, ".") {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			continue
		}

		virtualPath := dirPath + "/" + name
		if dirPath == "" {
			virtualPath = name
		}

		ext := strings.ToLower(filepath.Ext(name))

		if entry.IsDir() {
			displayName := name
			var metadata *FolderMetadata
			if m, ok := metadataMap[name]; ok {
				displayName = m.Name
				metadata = &m
			}

			var posterImage string
			entryPath := filepath.Join(fullPath, name)
			for _, posterName := range fs.posterNames {
				posterPath := filepath.Join(entryPath, posterName)
				if _, err := os.Stat(posterPath); err == nil {
					posterImage = posterName
					break
				}
			}

			items = append(items, FileSystemItem{
				Name:        displayName,
				Path:        virtualPath,
				ModifiedAt:  info.ModTime().Format("2006-01-02T15:04:05.000Z"),
				Type:        "folder",
				Metadata:    metadata,
				PosterImage: posterImage,
			})
		} else if mimeType, ok := fs.audioExts[ext]; ok {
			items = append(items, FileSystemItem{
				Name:       name,
				Path:       virtualPath,
				Size:       info.Size(),
				ModifiedAt: info.ModTime().Format("2006-01-02T15:04:05.000Z"),
				Type:       "audio",
				MimeType:   mimeType,
			})
		}
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].Type == "folder" && items[j].Type != "folder" {
			return true
		}
		if items[i].Type != "folder" && items[j].Type == "folder" {
			return false
		}
		if items[i].Type == "folder" && items[j].Type == "folder" {
			return items[i].Name < items[j].Name
		}
		return items[i].ModifiedAt > items[j].ModifiedAt
	})

	result := &DirectoryContents{Items: items, CurrentPath: dirPath}

	if fs.cacheTTL > 0 {
		fs.cacheMu.Lock()
		fs.cache[dirPath] = &cacheEntry{contents: result, timestamp: now}

		if rand.Float64() < 0.01 {
			for key, entry := range fs.cache {
				if now-entry.timestamp >= fs.cacheTTL {
					delete(fs.cache, key)
				}
			}
		}
		fs.cacheMu.Unlock()
	}

	return result, nil
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
