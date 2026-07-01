package services

import (
	"database/sql"
	"time"
)

func (s *SearchService) GetAllFolderPaths() ([]string, error) {
	rows, err := s.db.DB().Query(`SELECT path FROM folders ORDER BY path ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var paths []string
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			return nil, err
		}
		paths = append(paths, p)
	}
	return paths, nil
}

func (s *SearchService) BrowseDirectory(path string) (*DirectoryContents, error) {
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
		SELECT id, path, parent_path, folder_name, name, original_url,
		       url_broken, item_count, directory_size_bytes, poster_image,
		       upload_date, share_key
		FROM folders
		WHERE parent_path = $1
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
		var shareKey *string
		if err := rows.Scan(&f.ID, &f.Path, &f.ParentPath, &f.FolderName, &f.Name,
			&f.OriginalURL, &urlBroken, &f.ItemCount, &f.DirectorySize,
			&f.PosterImage, &f.UploadDate, &shareKey); err != nil {
			return nil, err
		}
		f.URLBroken = urlBroken == 1
		if shareKey != nil {
			f.ShareKey = *shareKey
		}
		folders = append(folders, f)
	}

	return folders, nil
}

func (s *SearchService) getAudioFilesByParentPath(parentPath string) ([]AudioFileRecord, error) {
	rows, err := s.db.DB().Query(`
		SELECT audio_files.id, audio_files.path, audio_files.parent_path, audio_files.filename,
		       audio_files.size, audio_files.mime_type, audio_files.title, audio_files.meta_artist,
		       audio_files.upload_date, audio_files.webpage_url, audio_files.description, audio_files.age_limit,
		       audio_files.share_key, audio_files.unavailable_at, wc.duration_seconds
		FROM audio_files
		LEFT JOIN waveform_cache wc ON wc.audio_file_id = audio_files.id
		WHERE audio_files.parent_path = $1 AND audio_files.deleted = 0
		ORDER BY audio_files.upload_date DESC
	`, parentPath)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var audioFiles []AudioFileRecord
	for rows.Next() {
		var a AudioFileRecord
		var unavailableAt sql.NullTime
		var ageLimit sql.NullInt64
		var durationSeconds sql.NullFloat64
		if err := rows.Scan(&a.ID, &a.Path, &a.ParentPath, &a.Filename, &a.Size,
			&a.MimeType, &a.Title, &a.MetaArtist, &a.UploadDate,
			&a.WebpageURL, &a.Description, &ageLimit, &a.ShareKey, &unavailableAt, &durationSeconds); err != nil {
			return nil, err
		}
		if ageLimit.Valid {
			v := int(ageLimit.Int64)
			a.AgeLimit = &v
		}
		if unavailableAt.Valid {
			s := unavailableAt.Time.UTC().Format(time.RFC3339)
			a.UnavailableAt = &s
		}
		if durationSeconds.Valid {
			a.DurationSeconds = durationSeconds.Float64
		}
		audioFiles = append(audioFiles, a)
	}

	return audioFiles, nil
}

func (s *SearchService) folderToFileSystemItem(f FolderRecord) FileSystemItem {
	modifiedAt := ""
	if len(f.UploadDate) == 8 {
		modifiedAt = f.UploadDate[:4] + "-" + f.UploadDate[4:6] + "-" + f.UploadDate[6:8]
	}
	item := FileSystemItem{
		Name:        f.Name,
		Path:        f.Path,
		Size:        f.DirectorySize,
		ModifiedAt:  modifiedAt,
		Type:        "folder",
		PosterImage: f.PosterImage,
		ShareKey:    f.ShareKey,
	}

	if f.OriginalURL != "" || f.URLBroken || f.ItemCount > 0 {
		item.Metadata = &FolderMetadata{
			FolderName:  f.FolderName,
			Name:        f.Name,
			OriginalURL: f.OriginalURL,
			URLBroken:   f.URLBroken,
			Items:       f.ItemCount,
		}
	}

	return item
}

func (s *SearchService) audioToFileSystemItem(a AudioFileRecord) FileSystemItem {
	modifiedAt := ""
	if len(a.UploadDate) == 8 {
		modifiedAt = a.UploadDate[:4] + "-" + a.UploadDate[4:6] + "-" + a.UploadDate[6:8]
	}
	return FileSystemItem{
		Name:            a.Filename,
		Path:            a.Path,
		Size:            a.Size,
		DurationSeconds: a.DurationSeconds,
		ModifiedAt:      modifiedAt,
		Type:            "audio",
		MimeType:        a.MimeType,
		Title:           a.Title,
		AgeLimit:        a.AgeLimit,
		ShareKey:        a.ShareKey,
		UnavailableAt:   a.UnavailableAt,
	}
}
