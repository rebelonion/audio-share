package services

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
		SELECT id, path, parent_path, folder_name, name, original_url, url_broken,
		       item_count, directory_size, poster_image, modified_at, share_key
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
		var shareKey *string
		if err := rows.Scan(&f.ID, &f.Path, &f.ParentPath, &f.FolderName, &f.Name,
			&f.OriginalURL, &urlBroken, &f.ItemCount, &f.DirectorySize,
			&f.PosterImage, &f.ModifiedAt, &shareKey); err != nil {
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
		SELECT id, path, parent_path, filename, size, mime_type, modified_at,
		       title, meta_artist, upload_date, webpage_url, description, share_key
		FROM audio_files
		WHERE parent_path = ? AND deleted = 0
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
			&a.WebpageURL, &a.Description, &a.ShareKey); err != nil {
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
		ShareKey:    f.ShareKey,
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
		ShareKey:   a.ShareKey,
	}
}
