package services

import (
	"database/sql"
	"fmt"
	"strings"
	"time"
)

type SearchResult struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	Path       string `json:"path"`
	Type       string `json:"type"`
	ParentPath string `json:"parentPath,omitempty"`
	ShareKey   string `json:"shareKey,omitempty"`

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

	ModifiedAt    string  `json:"modifiedAt,omitempty"`
	UnavailableAt *string `json:"unavailableAt,omitempty"`
}

type SearchOptions struct {
	// "audio", "folder", or "" (both)
	Type string
	// Only show audio files where unavailable_at IS NOT NULL
	UnavailableOnly bool
	// "name_asc", "name_desc", "date_asc", "date_desc"
	Sort string
	// ISO date strings "YYYY-MM-DD", filter by modified_at
	DateFrom string
	DateTo   string
	// Seconds; 0 means no bound
	DurationMin float64
	DurationMax float64
	// Which audio fields to search in: "filename", "title", "artist", "description"
	// Empty means search all fields.
	Fields []string
}

type SearchService struct {
	db             *Database
	fs             *FileSystemService
	webhookService *WebhookService
	lockPath       string
}

func NewSearchService(db *Database, fs *FileSystemService, webhookService *WebhookService) *SearchService {
	return &SearchService{
		db:             db,
		fs:             fs,
		webhookService: webhookService,
		lockPath:       "/tmp/audio-share.reindex.lock",
	}
}

func (s *SearchService) Search(query string, limit int, offset int, opts SearchOptions) ([]SearchResult, int, error) {
	if limit <= 0 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	// Determine which arms of the UNION to include
	includeAudio := opts.Type != "folder"
	includeFolders := opts.Type != "audio" && !opts.UnavailableOnly && opts.DurationMin == 0 && opts.DurationMax == 0

	// --- Build audio WHERE clause ---
	var audioArgs []any
	audioWhere := "deleted = 0"

	if query != "" {
		likeQuery := "%" + query + "%"
		fieldMap := map[string]string{
			"filename":    "filename",
			"title":       "title",
			"artist":      "meta_artist",
			"description": "description",
		}
		activeFields := opts.Fields
		if len(activeFields) == 0 {
			activeFields = []string{"filename", "title", "artist", "description"}
		}
		var fieldClauses []string
		for _, f := range activeFields {
			col, ok := fieldMap[f]
			if !ok {
				continue
			}
			audioArgs = append(audioArgs, likeQuery)
			fieldClauses = append(fieldClauses, fmt.Sprintf("%s ILIKE $%d", col, len(audioArgs)))
		}
		if len(fieldClauses) == 0 {
			audioArgs = append(audioArgs, likeQuery, likeQuery, likeQuery, likeQuery)
			fieldClauses = []string{
				fmt.Sprintf("filename ILIKE $%d", len(audioArgs)-3),
				fmt.Sprintf("title ILIKE $%d", len(audioArgs)-2),
				fmt.Sprintf("meta_artist ILIKE $%d", len(audioArgs)-1),
				fmt.Sprintf("description ILIKE $%d", len(audioArgs)),
			}
		}
		audioWhere = fmt.Sprintf("(%s) AND deleted = 0", strings.Join(fieldClauses, " OR "))
	}

	argIdx := len(audioArgs) + 1

	if opts.UnavailableOnly {
		audioWhere += " AND unavailable_at IS NOT NULL"
	}
	if opts.DateFrom != "" {
		audioWhere += fmt.Sprintf(" AND modified_at >= $%d", argIdx)
		audioArgs = append(audioArgs, opts.DateFrom)
		argIdx++
	}
	if opts.DateTo != "" {
		audioWhere += fmt.Sprintf(" AND modified_at <= $%d", argIdx)
		audioArgs = append(audioArgs, opts.DateTo+"T23:59:59.999Z")
		argIdx++
	}

	hasDurationFilter := opts.DurationMin > 0 || opts.DurationMax > 0
	audioJoin := ""
	if hasDurationFilter {
		audioJoin = "LEFT JOIN waveform_cache wc ON wc.audio_file_id = audio_files.id"
		if opts.DurationMin > 0 {
			audioWhere += fmt.Sprintf(" AND wc.duration_seconds >= $%d", argIdx)
			audioArgs = append(audioArgs, opts.DurationMin)
			argIdx++
		}
		if opts.DurationMax > 0 {
			audioWhere += fmt.Sprintf(" AND wc.duration_seconds <= $%d", argIdx)
			audioArgs = append(audioArgs, opts.DurationMax)
			argIdx++
		}
	}
	_ = argIdx // suppress unused warning if no more uses

	// --- Build folder WHERE clause ---
	var folderArgs []any
	folderArgIdx := 1
	folderWhere := "1=1"

	if query != "" {
		likeQuery := "%" + query + "%"
		folderArgs = append(folderArgs, likeQuery, likeQuery)
		folderArgIdx = 3
		folderWhere = "(name ILIKE $1 OR folder_name ILIKE $2)"
	}

	if opts.DateFrom != "" {
		folderWhere += fmt.Sprintf(" AND modified_at >= $%d", folderArgIdx)
		folderArgs = append(folderArgs, opts.DateFrom)
		folderArgIdx++
	}
	if opts.DateTo != "" {
		folderWhere += fmt.Sprintf(" AND modified_at <= $%d", folderArgIdx)
		folderArgs = append(folderArgs, opts.DateTo+"T23:59:59.999Z")
		folderArgIdx++
	}
	_ = folderArgIdx

	// --- Count query ---
	var total int
	var countParts []string
	if includeAudio {
		audioCountSQL := fmt.Sprintf(`SELECT COUNT(*) FROM audio_files %s WHERE %s`, audioJoin, audioWhere)
		countParts = append(countParts, "("+audioCountSQL+")")
	}
	if includeFolders {
		folderCountSQL := fmt.Sprintf(`SELECT COUNT(*) FROM folders WHERE %s`, folderWhere)
		countParts = append(countParts, "("+folderCountSQL+")")
	}

	if len(countParts) == 0 {
		return []SearchResult{}, 0, nil
	}

	// For the UNION count, we need combined args. Since we can't share placeholder indices
	// across subqueries in a single statement easily, run separate counts.
	total = 0
	if includeAudio {
		var audioCount int
		audioCountSQL := fmt.Sprintf(`SELECT COUNT(*) FROM audio_files %s WHERE %s`, audioJoin, audioWhere)
		if err := s.db.DB().QueryRow(audioCountSQL, audioArgs...).Scan(&audioCount); err != nil {
			return nil, 0, err
		}
		total += audioCount
	}
	if includeFolders {
		var folderCount int
		folderCountSQL := fmt.Sprintf(`SELECT COUNT(*) FROM folders WHERE %s`, folderWhere)
		if err := s.db.DB().QueryRow(folderCountSQL, folderArgs...).Scan(&folderCount); err != nil {
			return nil, 0, err
		}
		total += folderCount
	}

	// --- Build result query ---
	// We UNION the arms together, then sort and paginate the combined result.
	// Since PostgreSQL doesn't allow different placeholder indices across UNION arms,
	// we'll shift folder placeholders to start after audio placeholders.

	orderClause := "name ASC"
	switch opts.Sort {
	case "name_desc":
		orderClause = "name DESC"
	case "date_asc":
		orderClause = "modified_at ASC NULLS LAST"
	case "date_desc":
		orderClause = "modified_at DESC NULLS LAST"
	}

	var unionParts []string
	var allArgs []any

	if includeAudio {
		// Re-number placeholders for audio (starting at $1)
		audioSelect := fmt.Sprintf(`
			SELECT
				audio_files.id, COALESCE(NULLIF(audio_files.title, ''), audio_files.filename) as name, audio_files.path, 'audio' as type, audio_files.parent_path,
				audio_files.size, audio_files.mime_type, audio_files.title, audio_files.meta_artist as artist,
				audio_files.description, audio_files.webpage_url,
				NULL as original_url, NULL::bigint as item_count, NULL as directory_size, NULL as poster_image, audio_files.modified_at,
				audio_files.share_key, audio_files.unavailable_at
			FROM audio_files %s
			WHERE %s`, audioJoin, reindex(audioWhere, 1))
		unionParts = append(unionParts, audioSelect)
		allArgs = append(allArgs, audioArgs...)
	}

	if includeFolders {
		// Re-number folder placeholders to start after audio args
		folderOffset := len(allArgs) + 1
		folderSelect := fmt.Sprintf(`
			SELECT
				id, name, path, 'folder' as type, parent_path,
				NULL::bigint as size, NULL as mime_type, NULL as title, NULL as artist,
				NULL as description, NULL as webpage_url,
				original_url, item_count, directory_size, poster_image, modified_at,
				share_key, NULL::timestamptz as unavailable_at
			FROM folders
			WHERE %s`, reindex(folderWhere, folderOffset))
		unionParts = append(unionParts, folderSelect)
		allArgs = append(allArgs, folderArgs...)
	}

	// Add LIMIT/OFFSET placeholders
	limitIdx := len(allArgs) + 1
	offsetIdx := len(allArgs) + 2
	allArgs = append(allArgs, limit, offset)

	unionSQL := strings.Join(unionParts, "\n\t\tUNION ALL\n\t\t")
	finalSQL := fmt.Sprintf(`
		SELECT id, name, path, type, parent_path,
			size, mime_type, title, artist, description, webpage_url,
			original_url, item_count, directory_size, poster_image, modified_at,
			share_key, unavailable_at
		FROM (%s) sub
		ORDER BY %s
		LIMIT $%d OFFSET $%d
	`, unionSQL, orderClause, limitIdx, offsetIdx)

	rows, err := s.db.DB().Query(finalSQL, allArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var results []SearchResult
	for rows.Next() {
		var r SearchResult
		var parentPath, mimeType, title, artist, description, webpageURL *string
		var originalURL, directorySize, posterImage, modifiedAt, shareKey *string
		var size, itemCount *int64
		var unavailableAt sql.NullTime

		if err := rows.Scan(
			&r.ID, &r.Name, &r.Path, &r.Type, &parentPath,
			&size, &mimeType, &title, &artist, &description, &webpageURL,
			&originalURL, &itemCount, &directorySize, &posterImage, &modifiedAt,
			&shareKey, &unavailableAt,
		); err != nil {
			return nil, 0, err
		}
		if unavailableAt.Valid {
			s := unavailableAt.Time.UTC().Format(time.RFC3339)
			r.UnavailableAt = &s
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
		if modifiedAt != nil {
			r.ModifiedAt = *modifiedAt
		}
		if shareKey != nil {
			r.ShareKey = *shareKey
		}

		results = append(results, r)
	}

	return results, total, nil
}

// reindex replaces $1, $2, ... in a SQL fragment with $start, $start+1, ...
func reindex(sql string, start int) string {
	// Walk through the string and replace $N placeholders
	var b strings.Builder
	i := 0
	n := 1 // current placeholder number being replaced
	for i < len(sql) {
		if sql[i] == '$' && i+1 < len(sql) {
			// Read the number after $
			j := i + 1
			for j < len(sql) && sql[j] >= '0' && sql[j] <= '9' {
				j++
			}
			if j > i+1 {
				b.WriteString(fmt.Sprintf("$%d", start+n-1))
				n++
				i = j
				continue
			}
		}
		b.WriteByte(sql[i])
		i++
	}
	return b.String()
}

func (s *SearchService) RandomAudio() (string, error) {
	var shareKey string
	err := s.db.DB().QueryRow(`
		SELECT share_key FROM audio_files
		WHERE deleted = 0 AND share_key IS NOT NULL
		ORDER BY RANDOM() LIMIT 1
	`).Scan(&shareKey)
	if err != nil {
		return "", err
	}
	return shareKey, nil
}
