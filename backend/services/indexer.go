package services

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/robfig/cron/v3"
)

type FolderRecord struct {
	ID            int64
	Path          string
	ParentPath    string
	FolderName    string
	Name          string
	OriginalURL   string
	URLBroken     bool
	ItemCount     int
	DirectorySize string
	PosterImage   string
	ModifiedAt    string
	ShareKey      string
}

type AudioFileRecord struct {
	ID           int64
	Path         string
	ParentPath   string
	Filename     string
	Size         int64
	MimeType     string
	ModifiedAt   string
	Title        string
	MetaArtist   string
	UploadDate   string
	WebpageURL   string
	Description  string
	DownloadedAt string
	SourcePath   string
	Thumbnail    string
	ShareKey     string
	Deleted      bool
}

type AudioInfoJSON struct {
	Title       string  `json:"title"`
	MetaArtist  string  `json:"meta_artist"`
	UploadDate  string  `json:"upload_date"`
	WebpageURL  string  `json:"webpage_url"`
	Description string  `json:"description"`
	Epoch       float64 `json:"epoch"`
}

func generateShareKey() (string, error) {
	b := make([]byte, 6)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func nullIfEmpty(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

func (s *SearchService) RebuildIndex() error {
	lockFile, err := os.OpenFile(s.lockPath, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return err
	}
	defer lockFile.Close()

	err = syscall.Flock(int(lockFile.Fd()), syscall.LOCK_EX|syscall.LOCK_NB)
	if err != nil {
		log.Println("Reindex already in progress, skipping")
		return nil
	}
	defer syscall.Flock(int(lockFile.Fd()), syscall.LOCK_UN)

	log.Println("Starting index rebuild...")
	start := time.Now()
	startSQL := start.UTC().Truncate(time.Second).Format("2006-01-02 15:04:05")

	for slug, dirConfig := range s.fs.GetSlugToDirectoryMap() {
		log.Printf("Indexing directory: %s (%s)", dirConfig.Name, slug)

		modifiedAt := time.Now().Format("2006-01-02T15:04:05.000Z")
		if info, err := os.Stat(dirConfig.Path); err == nil {
			modifiedAt = info.ModTime().Format("2006-01-02T15:04:05.000Z")
		}
		if err := s.insertFolder(FolderRecord{
			Path:       slug,
			ParentPath: "",
			FolderName: slug,
			Name:       dirConfig.Name,
			ModifiedAt: modifiedAt,
		}); err != nil {
			log.Printf("Error indexing root folder %s: %v", slug, err)
		}

		if err := s.indexDirectory(slug, dirConfig.Path, "", ""); err != nil {
			log.Printf("Error indexing %s: %v", slug, err)
		}
	}

	if _, err := s.db.DB().Exec("DELETE FROM folders WHERE indexed_at < ?", startSQL); err != nil {
		log.Printf("Error cleaning up stale folders: %v", err)
	}
	if _, err := s.db.DB().Exec("UPDATE audio_files SET deleted = 1 WHERE indexed_at < ? AND deleted = 0", startSQL); err != nil {
		log.Printf("Error soft-deleting stale audio files: %v", err)
	}

	if _, err := s.db.DB().Exec(`
		UPDATE folders SET item_count = (
			SELECT COUNT(*) FROM folders f2 WHERE f2.parent_path = folders.path
		) + (
			SELECT COUNT(*) FROM audio_files WHERE parent_path = folders.path AND deleted = 0
		)
	`); err != nil {
		log.Printf("Error updating folder item counts: %v", err)
	}

	elapsed := time.Since(start)
	log.Printf("Index rebuild completed in %v", elapsed)

	return nil
}

func (s *SearchService) indexDirectory(slug, basePath, relativePath, sourcePath string) error {
	fullPath := filepath.Join(basePath, relativePath)

	entries, err := os.ReadDir(fullPath)
	if err != nil {
		return err
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
		if strings.HasPrefix(name, ".") && entry.IsDir() {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			log.Printf("Skipping %s: %v", name, err)
			continue
		}

		var virtualPath string
		if relativePath == "" {
			virtualPath = slug + "/" + name
		} else {
			virtualPath = slug + "/" + relativePath + "/" + name
		}

		parentPath := s.getParentPath(virtualPath)
		modifiedAt := info.ModTime().Format("2006-01-02T15:04:05.000Z")

		if entry.IsDir() {
			record := FolderRecord{
				Path:       virtualPath,
				ParentPath: parentPath,
				FolderName: name,
				Name:       name,
				ModifiedAt: modifiedAt,
			}

			if m, ok := metadataMap[name]; ok {
				record.Name = m.Name
				record.OriginalURL = m.OriginalURL
				record.URLBroken = m.URLBroken
				record.DirectorySize = m.DirectorySize
			}

			entryPath := filepath.Join(fullPath, name)
			for _, posterName := range s.fs.posterNames {
				posterPath := filepath.Join(entryPath, posterName)
				if _, err := os.Stat(posterPath); err == nil {
					record.PosterImage = posterName
					break
				}
			}

			if err := s.insertFolder(record); err != nil {
				log.Printf("Error indexing folder %s: %v", virtualPath, err)
			}

			childSourcePath := sourcePath
			if record.OriginalURL != "" {
				childSourcePath = virtualPath
			}

			subRelativePath := name
			if relativePath != "" {
				subRelativePath = relativePath + "/" + name
			}
			if err := s.indexDirectory(slug, basePath, subRelativePath, childSourcePath); err != nil {
				log.Printf("Error indexing subdirectory %s: %v", subRelativePath, err)
			}
		} else {
			ext := strings.ToLower(filepath.Ext(name))
			if mimeType, ok := s.fs.audioExts[ext]; ok {
				record := AudioFileRecord{
					Path:       virtualPath,
					ParentPath: parentPath,
					Filename:   name,
					Size:       info.Size(),
					MimeType:   mimeType,
					ModifiedAt: modifiedAt,
					SourcePath: sourcePath,
				}

				baseName := strings.TrimSuffix(name, filepath.Ext(name))

				for _, suffix := range []string{"-thumb.jpg", "-thumb.webp", "-thumb.png", ".jpg", ".webp", ".png"} {
					thumbPath := filepath.Join(fullPath, baseName+suffix)
					if _, err := os.Stat(thumbPath); err == nil {
						record.Thumbnail = baseName + suffix
						break
					}
				}

				infoPath := filepath.Join(fullPath, baseName+".info.json")
				if data, err := os.ReadFile(infoPath); err == nil {
					var infoJSON AudioInfoJSON
					if json.Unmarshal(data, &infoJSON) == nil {
						record.Title = infoJSON.Title
						record.MetaArtist = infoJSON.MetaArtist
						record.UploadDate = infoJSON.UploadDate
						record.WebpageURL = infoJSON.WebpageURL
						record.Description = infoJSON.Description
						if infoJSON.Epoch > 0 {
							record.DownloadedAt = time.Unix(int64(infoJSON.Epoch), 0).Format("2006-01-02T15:04:05Z")
						}
					}
				}

				if err := s.insertAudioFile(record); err != nil {
					log.Printf("Error indexing audio %s: %v", virtualPath, err)
				}
			}
		}
	}

	return nil
}

func (s *SearchService) getParentPath(path string) string {
	parts := strings.Split(path, "/")
	if len(parts) <= 1 {
		return ""
	}
	return strings.Join(parts[:len(parts)-1], "/")
}

func (s *SearchService) insertFolder(f FolderRecord) error {
	urlBroken := 0
	if f.URLBroken {
		urlBroken = 1
	}

	shareKey, err := generateShareKey()
	if err != nil {
		return err
	}

	_, err = s.db.DB().Exec(`
		INSERT INTO folders
		(path, parent_path, folder_name, name, original_url, url_broken,
		 item_count, directory_size, poster_image, modified_at, share_key, indexed_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(path) DO UPDATE SET
			parent_path = excluded.parent_path,
			folder_name = excluded.folder_name,
			name = excluded.name,
			original_url = excluded.original_url,
			url_broken = excluded.url_broken,
			item_count = excluded.item_count,
			directory_size = excluded.directory_size,
			poster_image = excluded.poster_image,
			modified_at = excluded.modified_at,
			share_key = COALESCE(folders.share_key, excluded.share_key),
			indexed_at = CURRENT_TIMESTAMP
	`, f.Path, f.ParentPath, f.FolderName, f.Name, f.OriginalURL, urlBroken,
		f.ItemCount, f.DirectorySize, f.PosterImage, f.ModifiedAt, shareKey)
	return err
}

func (s *SearchService) insertAudioFile(a AudioFileRecord) error {
	shareKey, err := generateShareKey()
	if err != nil {
		return err
	}

	_, err = s.db.DB().Exec(`
		INSERT INTO audio_files
		(path, parent_path, filename, size, mime_type, modified_at,
		 title, meta_artist, upload_date, webpage_url, description,
		 downloaded_at, source_path, thumbnail, share_key, deleted, indexed_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
		ON CONFLICT(path) DO UPDATE SET
			parent_path = excluded.parent_path,
			filename = excluded.filename,
			size = excluded.size,
			mime_type = excluded.mime_type,
			modified_at = excluded.modified_at,
			title = excluded.title,
			meta_artist = excluded.meta_artist,
			upload_date = excluded.upload_date,
			webpage_url = excluded.webpage_url,
			description = excluded.description,
			downloaded_at = excluded.downloaded_at,
			source_path = excluded.source_path,
			thumbnail = excluded.thumbnail,
			share_key = COALESCE(audio_files.share_key, excluded.share_key),
			deleted = 0,
			indexed_at = CURRENT_TIMESTAMP
	`, a.Path, a.ParentPath, a.Filename, a.Size, a.MimeType, a.ModifiedAt,
		a.Title, a.MetaArtist, a.UploadDate, a.WebpageURL, a.Description,
		nullIfEmpty(a.DownloadedAt), nullIfEmpty(a.SourcePath), nullIfEmpty(a.Thumbnail), shareKey)
	return err
}

func (s *SearchService) StartScheduledReindex(schedule string) {
	log.Printf("Starting scheduled reindex with schedule: %s", schedule)

	c := cron.New()
	_, err := c.AddFunc(schedule, func() {
		log.Println("Running scheduled reindex...")
		if err := s.RebuildIndex(); err != nil {
			log.Printf("Scheduled reindex error: %v", err)
		}
	})
	if err != nil {
		log.Printf("Error setting up reindex schedule: %v", err)
		return
	}
	c.Start()
}
