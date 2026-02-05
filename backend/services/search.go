package services

import (
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
	URLBroken     bool
	ItemCount     int
	DirectorySize string
	PosterImage   string
	ModifiedAt    string
}

type AudioFileRecord struct {
	ID          int64
	Path        string
	ParentPath  string
	Filename    string
	Size        int64
	MimeType    string
	ModifiedAt  string
	Title       string
	MetaArtist  string
	UploadDate  string
	WebpageURL  string
	Description string
}

type SearchResult struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	Path       string `json:"path"`
	Type       string `json:"type"`
	ParentPath string `json:"parentPath,omitempty"`

	// Audio fields
	Size        int64  `json:"size,omitempty"`
	MimeType    string `json:"mimeType,omitempty"`
	Title       string `json:"title,omitempty"`
	Artist      string `json:"artist,omitempty"`
	Description string `json:"description,omitempty"`
	WebpageURL  string `json:"webpageUrl,omitempty"`

	// Folder fields
	OriginalURL   string `json:"originalUrl,omitempty"`
	ItemCount     int    `json:"itemCount,omitempty"`
	DirectorySize string `json:"directorySize,omitempty"`
	PosterImage   string `json:"posterImage,omitempty"`

	ModifiedAt string `json:"modifiedAt,omitempty"`
}

type AudioInfoJSON struct {
	Title       string `json:"title"`
	MetaArtist  string `json:"meta_artist"`
	UploadDate  string `json:"upload_date"`
	WebpageURL  string `json:"webpage_url"`
	Description string `json:"description"`
}

type SearchService struct {
	db *Database
	fs *FileSystemService
}

func NewSearchService(db *Database, fs *FileSystemService) *SearchService {
	return &SearchService{
		db: db,
		fs: fs,
	}
}

func (s *SearchService) RebuildIndex() error {
	log.Println("Starting index rebuild...")
	start := time.Now()

	for slug, dirConfig := range s.fs.GetSlugToDirectoryMap() {
		log.Printf("Indexing directory: %s (%s)", dirConfig.Name, slug)
		if err := s.indexDirectory(slug, dirConfig.Path, ""); err != nil {
			log.Printf("Error indexing %s: %v", slug, err)
		}
	}

	if _, err := s.db.DB().Exec("DELETE FROM folders WHERE indexed_at < ?", start); err != nil {
		log.Printf("Error cleaning up stale folders: %v", err)
	}
	if _, err := s.db.DB().Exec("DELETE FROM audio_files WHERE indexed_at < ?", start); err != nil {
		log.Printf("Error cleaning up stale audio files: %v", err)
	}

	elapsed := time.Since(start)
	log.Printf("Index rebuild completed in %v", elapsed)

	return nil
}

func (s *SearchService) indexDirectory(slug, basePath, relativePath string) error {
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
		if strings.HasPrefix(name, ".") {
			continue
		}

		info, err := entry.Info()
		if err != nil {
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
				record.ItemCount = m.Items
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

			subRelativePath := name
			if relativePath != "" {
				subRelativePath = relativePath + "/" + name
			}
			if err := s.indexDirectory(slug, basePath, subRelativePath); err != nil {
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
				}

				baseName := strings.TrimSuffix(name, filepath.Ext(name))
				infoPath := filepath.Join(fullPath, baseName+".info.json")
				if data, err := os.ReadFile(infoPath); err == nil {
					var infoJSON AudioInfoJSON
					if json.Unmarshal(data, &infoJSON) == nil {
						record.Title = infoJSON.Title
						record.MetaArtist = infoJSON.MetaArtist
						record.UploadDate = infoJSON.UploadDate
						record.WebpageURL = infoJSON.WebpageURL
						record.Description = infoJSON.Description
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

	_, err := s.db.DB().Exec(`
		INSERT OR REPLACE INTO folders
		(path, parent_path, folder_name, name, original_url, url_broken,
		 item_count, directory_size, poster_image, modified_at, indexed_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
	`, f.Path, f.ParentPath, f.FolderName, f.Name, f.OriginalURL, urlBroken,
		f.ItemCount, f.DirectorySize, f.PosterImage, f.ModifiedAt)
	return err
}

func (s *SearchService) insertAudioFile(a AudioFileRecord) error {
	_, err := s.db.DB().Exec(`
		INSERT OR REPLACE INTO audio_files
		(path, parent_path, filename, size, mime_type, modified_at,
		 title, meta_artist, upload_date, webpage_url, description, indexed_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
	`, a.Path, a.ParentPath, a.Filename, a.Size, a.MimeType, a.ModifiedAt,
		a.Title, a.MetaArtist, a.UploadDate, a.WebpageURL, a.Description)
	return err
}

func (s *SearchService) Search(query string, limit int, offset int) ([]SearchResult, int, error) {
	if limit <= 0 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	likeQuery := "%" + query + "%"

	var total int
	err := s.db.DB().QueryRow(`
		SELECT (
			SELECT COUNT(*) FROM folders
			WHERE name LIKE ? OR folder_name LIKE ?
		) + (
			SELECT COUNT(*) FROM audio_files
			WHERE filename LIKE ? OR title LIKE ? OR meta_artist LIKE ? OR description LIKE ?
		)
	`, likeQuery, likeQuery, likeQuery, likeQuery, likeQuery, likeQuery).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	rows, err := s.db.DB().Query(`
		SELECT
			id, name, path, 'folder' as type, parent_path,
			NULL as size, NULL as mime_type, NULL as title, NULL as artist,
			NULL as description, NULL as webpage_url,
			original_url, item_count, directory_size, poster_image, modified_at
		FROM folders
		WHERE name LIKE ? OR folder_name LIKE ?

		UNION ALL

		SELECT
			id, COALESCE(NULLIF(title, ''), filename) as name, path, 'audio' as type, parent_path,
			size, mime_type, title, meta_artist as artist,
			description, webpage_url,
			NULL as original_url, NULL as item_count, NULL as directory_size, NULL as poster_image, modified_at
		FROM audio_files
		WHERE filename LIKE ? OR title LIKE ? OR meta_artist LIKE ? OR description LIKE ?

		LIMIT ? OFFSET ?
	`, likeQuery, likeQuery, likeQuery, likeQuery, likeQuery, likeQuery, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var results []SearchResult
	for rows.Next() {
		var r SearchResult
		var parentPath, mimeType, title, artist, description, webpageURL *string
		var originalURL, directorySize, posterImage, modifiedAt *string
		var size, itemCount *int64

		if err := rows.Scan(
			&r.ID, &r.Name, &r.Path, &r.Type, &parentPath,
			&size, &mimeType, &title, &artist, &description, &webpageURL,
			&originalURL, &itemCount, &directorySize, &posterImage, &modifiedAt,
		); err != nil {
			return nil, 0, err
		}

		if parentPath != nil {
			r.ParentPath = *parentPath
		}
		if size != nil {
			r.Size = *size
		}
		if mimeType != nil {
			r.MimeType = *mimeType
		}
		if title != nil {
			r.Title = *title
		}
		if artist != nil {
			r.Artist = *artist
		}
		if description != nil {
			r.Description = *description
		}
		if webpageURL != nil {
			r.WebpageURL = *webpageURL
		}
		if originalURL != nil {
			r.OriginalURL = *originalURL
		}
		if itemCount != nil {
			r.ItemCount = int(*itemCount)
		}
		if directorySize != nil {
			r.DirectorySize = *directorySize
		}
		if posterImage != nil {
			r.PosterImage = *posterImage
		}
		if modifiedAt != nil {
			r.ModifiedAt = *modifiedAt
		}

		results = append(results, r)
	}

	return results, total, nil
}

func (s *SearchService) StartPeriodicReindex(interval time.Duration) {
	log.Printf("Starting periodic reindex every %v", interval)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for range ticker.C {
		log.Println("Running periodic reindex...")
		if err := s.RebuildIndex(); err != nil {
			log.Printf("Periodic reindex error: %v", err)
		}
	}
}

func (s *SearchService) BrowseDirectory(path string) (*DirectoryContents, error) {
	// Root path: delegate to filesystem (slugs are config-driven)
	if path == "" {
		return s.fs.GetDirectoryContents("")
	}
	folders, err := s.getFoldersByParentPath(path)
	if err != nil {
		return nil, err
	}

	audioFiles, err := s.getAudioFilesByParentPath(path)
	if err != nil {
		return nil, err
	}

	items := make([]FileSystemItem, 0, len(folders)+len(audioFiles))

	for _, f := range folders {
		items = append(items, s.folderToFileSystemItem(f))
	}
	for _, a := range audioFiles {
		items = append(items, s.audioToFileSystemItem(a))
	}

	return &DirectoryContents{
		Items:       items,
		CurrentPath: path,
	}, nil
}

func (s *SearchService) getFoldersByParentPath(parentPath string) ([]FolderRecord, error) {
	rows, err := s.db.DB().Query(`
		SELECT id, path, parent_path, folder_name, name, original_url, url_broken,
		       item_count, directory_size, poster_image, modified_at
		FROM folders
		WHERE parent_path = ?
		ORDER BY name ASC
	`, parentPath)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var folders []FolderRecord
	for rows.Next() {
		var f FolderRecord
		var urlBroken int
		if err := rows.Scan(&f.ID, &f.Path, &f.ParentPath, &f.FolderName, &f.Name,
			&f.OriginalURL, &urlBroken, &f.ItemCount, &f.DirectorySize,
			&f.PosterImage, &f.ModifiedAt); err != nil {
			return nil, err
		}
		f.URLBroken = urlBroken == 1
		folders = append(folders, f)
	}

	return folders, nil
}

func (s *SearchService) getAudioFilesByParentPath(parentPath string) ([]AudioFileRecord, error) {
	rows, err := s.db.DB().Query(`
		SELECT id, path, parent_path, filename, size, mime_type, modified_at,
		       title, meta_artist, upload_date, webpage_url, description
		FROM audio_files
		WHERE parent_path = ?
		ORDER BY modified_at DESC
	`, parentPath)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var audioFiles []AudioFileRecord
	for rows.Next() {
		var a AudioFileRecord
		if err := rows.Scan(&a.ID, &a.Path, &a.ParentPath, &a.Filename, &a.Size,
			&a.MimeType, &a.ModifiedAt, &a.Title, &a.MetaArtist, &a.UploadDate,
			&a.WebpageURL, &a.Description); err != nil {
			return nil, err
		}
		audioFiles = append(audioFiles, a)
	}

	return audioFiles, nil
}

func (s *SearchService) folderToFileSystemItem(f FolderRecord) FileSystemItem {
	item := FileSystemItem{
		Name:        f.Name,
		Path:        f.Path,
		ModifiedAt:  f.ModifiedAt,
		Type:        "folder",
		PosterImage: f.PosterImage,
	}

	if f.OriginalURL != "" || f.URLBroken || f.ItemCount > 0 || f.DirectorySize != "" {
		item.Metadata = &FolderMetadata{
			FolderName:    f.FolderName,
			Name:          f.Name,
			OriginalURL:   f.OriginalURL,
			URLBroken:     f.URLBroken,
			Items:         f.ItemCount,
			DirectorySize: f.DirectorySize,
		}
	}

	return item
}

func (s *SearchService) audioToFileSystemItem(a AudioFileRecord) FileSystemItem {
	return FileSystemItem{
		Name:       a.Filename,
		Path:       a.Path,
		Size:       a.Size,
		ModifiedAt: a.ModifiedAt,
		Type:       "audio",
		MimeType:   a.MimeType,
	}
}
