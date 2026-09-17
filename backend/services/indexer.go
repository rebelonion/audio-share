package services

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type FolderRecord struct {
	ID            int64
	Path          string
	ParentPath    string
	FolderName    string
	Name          string
	OriginalURL   string
	URLBroken     bool // computed from child file availability, not stored
	ItemCount     int
	DirectorySize int64 // computed as sum of child audio file sizes (bytes), not stored
	PosterImage   string
	UploadDate    string // computed from MAX(child upload_dates); seeded from filesystem mtime as fallback
	ShareKey      string
}

type AudioFileRecord struct {
	ID                 int64
	Path               string
	ParentPath         string
	Filename           string
	Size               int64
	MimeType           string
	Title              string
	MetaArtist         string
	UploadDate         string
	WebpageURL         string
	Description        string
	DownloadedAt       string
	SourcePath         string
	Thumbnail          string
	AgeLimit           *int
	ShareKey           string
	Deleted            bool
	DurationSeconds    float64
	UnavailableAt      *string
	RemovalRequestedAt *string
}

type AudioInfoJSON struct {
	Title       string  `json:"title"`
	MetaArtist  string  `json:"meta_artist"`
	Uploader    string  `json:"uploader"`
	UploadDate  string  `json:"upload_date"`
	WebpageURL  string  `json:"webpage_url"`
	Description string  `json:"description"`
	Epoch       float64 `json:"epoch"`
	AgeLimit    *int    `json:"age_limit"`
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
	err := withJobLock(s.db.DB(), "reindex", func(conn *sql.Conn) error {
		job := &indexJob{conn: conn, fs: s.fs, webhookService: s.webhookService, reporter: s.db.Errors}
		return job.rebuildIndex()
	})
	if err != nil {
		s.db.Errors.Report("worker", ErrorEvent{Operation: "reindex", Stage: "run", Cause: "unexpected", Outcome: "blocked"})
	}
	return err
}

type indexJob struct {
	conn             *sql.Conn
	fs               *FileSystemService
	webhookService   *WebhookService
	reporter         *ErrorReporter
	metadataFailures int
	skippedFiles     int
}

func (s *indexJob) rebuildIndex() error {
	defer func() {
		if s.metadataFailures+s.skippedFiles > 0 {
			s.reporter.Report("worker", ErrorEvent{Operation: "reindex", Stage: "parse", Cause: "partial-failure", Outcome: "degraded", FailedItems: s.metadataFailures + s.skippedFiles})
		}
	}()
	log.Println("Starting index rebuild...")
	start := time.Now().UTC().Truncate(time.Second)

	for slug, dirConfig := range s.fs.GetSlugToDirectoryMap() {
		log.Printf("Indexing directory: %s (%s)", dirConfig.Name, slug)

		uploadDate := time.Now().Format("20060102")
		if info, err := os.Stat(dirConfig.Path); err == nil {
			uploadDate = info.ModTime().Format("20060102")
		}
		if err := s.insertFolder(FolderRecord{
			Path:       slug,
			ParentPath: "",
			FolderName: slug,
			Name:       dirConfig.Name,
			UploadDate: uploadDate,
		}); err != nil {
			return err
		}

		if err := s.indexDirectory(slug, dirConfig.Path, "", ""); err != nil {
			return err
		}
	}

	if _, err := s.conn.ExecContext(context.Background(), "DELETE FROM folders WHERE indexed_at < $1", start); err != nil {
		return err
	}
	if _, err := s.conn.ExecContext(context.Background(), "UPDATE audio_files SET deleted = 1 WHERE indexed_at < $1 AND deleted = 0", start); err != nil {
		return err
	}

	if _, err := s.conn.ExecContext(context.Background(), `
		UPDATE folders SET item_count = (
			SELECT COUNT(*) FROM folders f2
			WHERE f2.path LIKE folders.path || '/%'
		) + (
			SELECT COUNT(*) FROM audio_files
			WHERE (parent_path = folders.path OR parent_path LIKE folders.path || '/%')
			AND deleted = 0
		)
	`); err != nil {
		return err
	}

	if _, err := s.conn.ExecContext(context.Background(), `
		UPDATE folders SET
			directory_size_bytes = COALESCE(
				(SELECT SUM(size) FROM audio_files
				 WHERE (parent_path = folders.path OR parent_path LIKE folders.path || '/%')
				 AND deleted = 0),
				0
			),
			url_broken = CASE
				WHEN EXISTS (
					SELECT 1 FROM audio_files
					WHERE (parent_path = folders.path OR parent_path LIKE folders.path || '/%')
					AND deleted = 0
				)
				AND NOT EXISTS (
					SELECT 1 FROM audio_files
					WHERE (parent_path = folders.path OR parent_path LIKE folders.path || '/%')
					AND deleted = 0 AND unavailable_at IS NULL
				)
				THEN 1 ELSE 0
			END,
			upload_date = COALESCE(
				(SELECT MAX(upload_date) FROM audio_files
				 WHERE (parent_path = folders.path OR parent_path LIKE folders.path || '/%')
				 AND deleted = 0 AND upload_date IS NOT NULL AND upload_date != ''),
				folders.upload_date
			)
	`); err != nil {
		return err
	}

	elapsed := time.Since(start)
	log.Printf("Index rebuild completed in %v", elapsed)

	if s.webhookService != nil && s.webhookService.IsConfigured() {
		folders, err := s.getIndexedFoldersWithURLForWebhook(start)
		if err != nil {
			log.Printf("Error fetching folders for webhook: %v", err)
			s.reporter.Report("worker", ErrorEvent{Operation: "index-webhook", Stage: "request", Cause: "unavailable", Outcome: "blocked"})
		} else if err := s.webhookService.SendIndexComplete(elapsed, folders); err != nil {
			log.Printf("Error sending webhook: %v", err)
			s.reporter.Report("worker", ErrorEvent{Operation: "index-webhook", Stage: "deliver", Cause: "unavailable", Outcome: "blocked"})
		} else {
			log.Printf("Webhook sent successfully with %d folders", len(folders))
		}
	}

	return nil
}

// getIndexedFoldersWithURLForWebhook returns all folders with an original_url that were
// present (or re-indexed) during this run. The name reflects that this includes both
// newly added and re-indexed folders — the webhook consumer needs all of them.
func (s *indexJob) getIndexedFoldersWithURLForWebhook(start time.Time) ([]NewFolder, error) {
	rows, err := s.conn.QueryContext(context.Background(), `
		SELECT share_key, name, original_url
		FROM folders
		WHERE original_url IS NOT NULL AND original_url != ''
		AND indexed_at >= $1
	`, start)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	folders := make([]NewFolder, 0)
	for rows.Next() {
		var shareKey, name string
		var originalURL *string
		if err := rows.Scan(&shareKey, &name, &originalURL); err != nil {
			return nil, err
		}
		url := ""
		if originalURL != nil {
			url = *originalURL
		}
		folders = append(folders, NewFolder{
			ShareKey:    shareKey,
			Name:        name,
			OriginalURL: url,
		})
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return folders, nil
}

func (s *indexJob) indexDirectory(slug, basePath, relativePath, sourcePath string) error {
	fullPath := filepath.Join(basePath, relativePath)

	entries, err := os.ReadDir(fullPath)
	if err != nil {
		return err
	}

	var folderMetadataList []FolderMetadata
	metadataPath := filepath.Join(fullPath, "folder.json")
	if data, err := os.ReadFile(metadataPath); err == nil {
		if json.Unmarshal(data, &folderMetadataList) != nil {
			s.metadataFailures++
		}
	} else if !os.IsNotExist(err) {
		s.metadataFailures++
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
			s.skippedFiles++
			continue
		}

		var virtualPath string
		if relativePath == "" {
			virtualPath = slug + "/" + name
		} else {
			virtualPath = slug + "/" + relativePath + "/" + name
		}

		parentPath := s.getParentPath(virtualPath)
		if entry.IsDir() {
			record := FolderRecord{
				Path:       virtualPath,
				ParentPath: parentPath,
				FolderName: name,
				Name:       name,
				UploadDate: info.ModTime().Format("20060102"),
			}

			if m, ok := metadataMap[name]; ok {
				record.Name = m.Name
				record.OriginalURL = m.OriginalURL
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
				return err
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
				return err
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
						if record.MetaArtist == "" {
							record.MetaArtist = infoJSON.Uploader
						}
						record.UploadDate = infoJSON.UploadDate
						record.WebpageURL = infoJSON.WebpageURL
						record.Description = infoJSON.Description
						if infoJSON.Epoch > 0 {
							record.DownloadedAt = time.Unix(int64(infoJSON.Epoch), 0).Format("2006-01-02T15:04:05Z")
						}
						record.AgeLimit = infoJSON.AgeLimit
					} else {
						s.metadataFailures++
					}
				} else if !os.IsNotExist(err) {
					s.metadataFailures++
				}
				if record.UploadDate == "" {
					record.UploadDate = info.ModTime().Format("20060102")
				}

				if err := s.insertAudioFile(record); err != nil {
					return err
				}
			}
		}
	}

	return nil
}

func (s *indexJob) getParentPath(path string) string {
	parts := strings.Split(path, "/")
	if len(parts) <= 1 {
		return ""
	}
	return strings.Join(parts[:len(parts)-1], "/")
}

func (s *indexJob) insertFolder(f FolderRecord) error {
	shareKey, err := generateShareKey()
	if err != nil {
		return err
	}

	_, err = s.conn.ExecContext(context.Background(), `
		INSERT INTO folders
		(path, parent_path, folder_name, name, original_url,
		 poster_image, upload_date, share_key, indexed_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
		ON CONFLICT(path) DO UPDATE SET
			parent_path = excluded.parent_path,
			folder_name = excluded.folder_name,
			name = excluded.name,
			original_url = excluded.original_url,
			poster_image = excluded.poster_image,
			upload_date = COALESCE(folders.upload_date, excluded.upload_date),
			share_key = COALESCE(folders.share_key, excluded.share_key),
			indexed_at = CURRENT_TIMESTAMP
	`, f.Path, f.ParentPath, f.FolderName, f.Name, f.OriginalURL,
		f.PosterImage, f.UploadDate, shareKey)
	return err
}

func (s *indexJob) insertAudioFile(a AudioFileRecord) error {
	shareKey, err := generateShareKey()
	if err != nil {
		return err
	}

	_, err = s.conn.ExecContext(context.Background(), `
		INSERT INTO audio_files
		(path, parent_path, filename, size, mime_type,
		 title, meta_artist, upload_date, webpage_url, description,
		 downloaded_at, source_path, thumbnail, age_limit, share_key, deleted, indexed_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 0, CURRENT_TIMESTAMP)
		ON CONFLICT(path) DO UPDATE SET
			parent_path = excluded.parent_path,
			filename = excluded.filename,
			size = excluded.size,
			mime_type = excluded.mime_type,
			title = excluded.title,
			meta_artist = excluded.meta_artist,
			upload_date = excluded.upload_date,
			webpage_url = excluded.webpage_url,
			description = excluded.description,
			downloaded_at = excluded.downloaded_at,
			source_path = excluded.source_path,
			thumbnail = excluded.thumbnail,
			age_limit = excluded.age_limit,
			share_key = COALESCE(audio_files.share_key, excluded.share_key),
			deleted = 0,
			indexed_at = CURRENT_TIMESTAMP
	`, a.Path, a.ParentPath, a.Filename, a.Size, a.MimeType,
		a.Title, a.MetaArtist, a.UploadDate, a.WebpageURL, a.Description,
		nullIfEmpty(a.DownloadedAt), nullIfEmpty(a.SourcePath), nullIfEmpty(a.Thumbnail), a.AgeLimit, shareKey)
	return err
}
