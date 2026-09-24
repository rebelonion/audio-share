package services

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

var filenameMediaID = regexp.MustCompile(`\[([^\[\]]+)\]$`)

func mediaIDFromFilename(filename string) string {
	base := strings.TrimSuffix(filename, filepath.Ext(filename))
	match := filenameMediaID.FindStringSubmatch(base)
	if len(match) == 0 {
		return ""
	}
	return strings.TrimSpace(match[1])
}

func resolveMediaPath(fs *FileSystemService, path string) (string, error) {
	parts := strings.SplitN(path, "/", 2)
	relative := ""
	if len(parts) == 2 {
		relative = parts[1]
	}
	full, valid := fs.ValidatePath(parts[0], relative)
	if !valid {
		return "", fmt.Errorf("invalid media path %q", path)
	}
	return full, nil
}

var errIncompleteAudioDirectory = errors.New("incomplete audio directory scan")
var errAudioFileChanged = fmt.Errorf("%w: audio file changed during scan", errIncompleteAudioDirectory)

type mediaFailure func(stage, path string, err error)

func readAudioRecord(ctx context.Context, fs *FileSystemService, parent, sourcePath, fullPath string, info os.FileInfo, failure mediaFailure) (AudioFileRecord, error) {
	name := info.Name()
	a := AudioFileRecord{Path: parent + "/" + name, ParentPath: parent, Filename: name,
		Size: info.Size(), FileMtimeNS: info.ModTime().UnixNano(), MimeType: fs.audioExts[strings.ToLower(filepath.Ext(name))],
		SourcePath: sourcePath, MediaID: mediaIDFromFilename(name)}
	base := strings.TrimSuffix(fullPath, filepath.Ext(fullPath))
	for _, suffix := range []string{"-thumb.jpg", "-thumb.webp", "-thumb.png", ".jpg", ".webp", ".png"} {
		if _, err := fs.StatMedia(ctx, base+suffix); err == nil {
			a.Thumbnail = filepath.Base(base) + suffix
			break
		} else if ioErr := mediaIOFailure(ctx, err); ioErr != nil {
			failure("stat", base+suffix, ioErr)
			return AudioFileRecord{}, ioErr
		}
	}
	data, err := runMediaIO(ctx, fs.mediaIO, base+".info.json", func() ([]byte, error) { return fs.mediaIO.readSidecar(base + ".info.json") }, nil)
	if err == nil {
		var metadata AudioInfoJSON
		if err = json.Unmarshal(data, &metadata); err == nil {
			if id := strings.TrimSpace(metadata.ID); id != "" {
				a.MediaID = id
			}
			a.Title, a.MetaArtist = metadata.Title, metadata.MetaArtist
			if a.MetaArtist == "" {
				a.MetaArtist = metadata.Uploader
			}
			a.UploadDate, a.WebpageURL, a.Description = metadata.UploadDate, metadata.WebpageURL, metadata.Description
			a.AgeLimit = metadata.AgeLimit
			if metadata.Epoch > 0 {
				a.DownloadedAt = time.Unix(int64(metadata.Epoch), 0).Format(time.RFC3339)
			}
		} else {
			failure("parse", base+".info.json", err)
			return AudioFileRecord{}, err
		}
	} else {
		failure("read", base+".info.json", err)
		return AudioFileRecord{}, err
	}
	if a.UploadDate == "" {
		a.UploadDate = info.ModTime().Format("20060102")
	}
	return a, nil
}

// RecoverMissingAudio shares one folder refresh across callers and server processes.
// Only existing active records can be refreshed; no records are merged.
func RecoverMissingAudio(ctx context.Context, db *sql.DB, fs *FileSystemService, id int64) (err error) {
	ctx, cancel := context.WithTimeout(ctx, MediaPreparationTimeout)
	defer cancel()
	conn, err := db.Conn(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()
	var parent string
	if err := conn.QueryRowContext(ctx, `SELECT parent_path FROM audio_files
		WHERE id = $1 AND deleted = 0`, id).Scan(&parent); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		return err
	}
	// Keep the folder lock across the committed cooldown claim and the scan transaction.
	// A failed scan must not roll back its cooldown and allow another request to repeat it.
	lockKey := "audio-folder:" + parent
	if _, err := conn.ExecContext(ctx, `SELECT pg_advisory_lock(hashtextextended($1, 0))`, lockKey); err != nil {
		conn.Raw(func(any) error { return driver.ErrBadConn })
		return err
	}
	defer func() {
		unlockCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if _, unlockErr := conn.ExecContext(unlockCtx, `SELECT pg_advisory_unlock(hashtextextended($1, 0))`, lockKey); unlockErr != nil {
			conn.Raw(func(any) error { return driver.ErrBadConn })
			if err == nil {
				err = unlockErr
			}
		}
	}()
	// Another caller or the indexer may have restored the file while this request waited.
	var path string
	if err := conn.QueryRowContext(ctx, `SELECT path FROM audio_files
		WHERE id = $1 AND parent_path = $2
		AND deleted = 0`, id, parent).Scan(&path); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		return err
	}
	full, err := resolveMediaPath(fs, path)
	if err != nil {
		return err
	}
	if _, err := fs.StatMedia(ctx, full); err == nil {
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}

	var claimed string
	err = conn.QueryRowContext(ctx, `INSERT INTO media_recovery_attempts(parent_path, attempted_at)
		VALUES ($1, clock_timestamp())
		ON CONFLICT(parent_path) DO UPDATE SET attempted_at = excluded.attempted_at
		WHERE media_recovery_attempts.attempted_at <= clock_timestamp() - INTERVAL '30 seconds'
		RETURNING parent_path`, parent).Scan(&claimed)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	return reconcileAudioDirectory(ctx, conn, fs, parent, "", true, func(stage, path string, err error) {
		log.Printf("Media recovery %s %s: %v", stage, path, err)
	})
}

// Folder locks cover the filesystem scan as well as the writes, so playback and indexing
// cannot apply competing decisions based on snapshots taken before acquiring the lock.
func reconcileAudioDirectory(ctx context.Context, conn *sql.Conn, fs *FileSystemService, parent, source string, recoverOnly bool, failure mediaFailure) error {
	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, "audio-folder:"+parent); err != nil {
		return err
	}
	fullDir, err := resolveMediaPath(fs, parent)
	if err != nil {
		return err
	}
	// Playback recovery is bounded; a normal index has no directory-size limit.
	limit := -1
	if recoverOnly {
		limit = 10001
	}
	entries, err := runMediaIO(ctx, fs.mediaIO, fullDir, func() ([]os.DirEntry, error) { return fs.mediaIO.readDir(fullDir, limit) }, nil)
	if err != nil {
		failure("read", fullDir, err)
		return fmt.Errorf("%w: %w", errIncompleteAudioDirectory, err)
	}
	if recoverOnly && len(entries) >= limit {
		return fmt.Errorf("media recovery directory exceeds 10000 entries")
	}
	var files []AudioFileRecord
	complete := true
	var scanErr error
	for _, entry := range entries {
		if err := ctx.Err(); err != nil {
			return err
		}
		if entry.IsDir() || fs.audioExts[strings.ToLower(filepath.Ext(entry.Name()))] == "" {
			continue
		}
		full := filepath.Join(fullDir, entry.Name())
		info, err := fs.StatMedia(ctx, full)
		if err != nil {
			failure("stat", full, err)
			if ioErr := mediaIOFailure(ctx, err); ioErr != nil {
				complete, scanErr = false, ioErr
				break
			}
			complete = false
			continue
		}
		if !info.Mode().IsRegular() {
			continue
		}
		a, err := readAudioRecord(ctx, fs, parent, source, full, info, failure)
		if err != nil {
			if ioErr := mediaIOFailure(ctx, err); ioErr != nil {
				complete, scanErr = false, ioErr
				break
			}
			complete = false
			continue
		}
		files = append(files, a)
	}
	rows, err := tx.QueryContext(ctx, `SELECT id, path, filename, COALESCE(media_id, ''), COALESCE(source_path, ''), deleted <> 0, identity_conflicted
		FROM audio_files WHERE parent_path = $1 FOR UPDATE`, parent)
	if err != nil {
		return err
	}
	var indexed []indexedMedia
	for rows.Next() {
		var old indexedMedia
		if err := rows.Scan(&old.id, &old.path, &old.filename, &old.mediaID, &old.sourcePath, &old.deleted, &old.identityConflicted); err != nil {
			rows.Close()
			return err
		}
		indexed = append(indexed, old)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	catalog := newMediaCatalog(indexed)
	var blocked []indexedMedia
	if !recoverOnly {
		blocked = catalog.conflicts(files)
	}
	for _, old := range blocked {
		if _, err := tx.ExecContext(ctx, `UPDATE audio_files SET deleted=1, identity_conflicted=TRUE,
			media_id=$2, media_revision=media_revision+1 WHERE id=$1`, old.id, old.mediaID); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM waveform_cache WHERE audio_file_id=$1`, old.id); err != nil {
			return err
		}
	}
	if len(blocked) > 0 {
		if _, err := tx.ExecContext(ctx, `SAVEPOINT media_reconciliation`); err != nil {
			return err
		}
	}
	if !complete {
		if scanErr == nil {
			scanErr = fmt.Errorf("incomplete metadata in %s", parent)
		}
		return commitMediaBlocks(ctx, tx, blocked, fmt.Errorf("%w: %w", errIncompleteAudioDirectory, scanErr), failure)
	}
	updates, err := catalog.plan(files, recoverOnly, func(path string) (bool, error) {
		full, err := resolveMediaPath(fs, path)
		if err != nil {
			return false, err
		}
		_, err = fs.StatMedia(ctx, full)
		if ioErr := mediaIOFailure(ctx, err); ioErr != nil {
			err = ioErr
		}
		if os.IsNotExist(err) {
			return true, nil
		}
		if err != nil {
			failure("stat", full, err)
			return false, fmt.Errorf("%w: %w", errIncompleteAudioDirectory, err)
		}
		return false, nil
	}, failure)
	if err == nil {
		err = applyMediaUpdates(ctx, tx, fs, fullDir, updates, recoverOnly, failure)
	}
	if err != nil {
		return commitMediaBlocks(ctx, tx, blocked, err, failure)
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	restored := make(map[int64]bool)
	for _, update := range updates {
		restored[update.old.id] = true
	}
	for _, old := range blocked {
		if !restored[old.id] {
			reportMediaBlock(old, failure)
		}
	}
	return nil
}

func applyMediaUpdates(ctx context.Context, tx *sql.Tx, fs *FileSystemService, fullDir string, updates []mediaUpdate, recoverOnly bool, failure mediaFailure) error {
	// Check final path uniqueness at commit so swaps and longer rename cycles are atomic.
	if _, err := tx.ExecContext(ctx, `SET CONSTRAINTS audio_files_active_path_key DEFERRED`); err != nil {
		return err
	}
	for _, update := range updates {
		a, old := update.audio, update.old
		full := filepath.Join(fullDir, a.Filename)
		info, err := fs.StatMedia(ctx, full)
		if ioErr := mediaIOFailure(ctx, err); ioErr != nil {
			failure("validate", full, ioErr)
			return fmt.Errorf("%w: %w", errIncompleteAudioDirectory, ioErr)
		}
		if err != nil || !info.Mode().IsRegular() || info.Size() != a.Size || info.ModTime().UnixNano() != a.FileMtimeNS {
			changeErr := fmt.Errorf("%w: %s", errAudioFileChanged, a.Path)
			if err != nil {
				changeErr = fmt.Errorf("%w: %w", changeErr, err)
			}
			failure("validate", full, changeErr)
			return changeErr
		}
		if recoverOnly {
			a.SourcePath = old.sourcePath
		}
		if err := storeAudioRecord(ctx, tx, a, old.id); err != nil {
			return err
		}
	}
	return ctx.Err()
}

// Preserve only the known-conflict blocks when the rest of reconciliation fails.
func commitMediaBlocks(ctx context.Context, tx *sql.Tx, blocked []indexedMedia, cause error, failure mediaFailure) error {
	if len(blocked) == 0 {
		return cause
	}
	if _, err := tx.ExecContext(ctx, `ROLLBACK TO SAVEPOINT media_reconciliation`); err != nil {
		return fmt.Errorf("persist media identity blocks: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("persist media identity blocks: %w", err)
	}
	for _, old := range blocked {
		reportMediaBlock(old, failure)
	}
	return cause
}

func reportMediaBlock(old indexedMedia, failure mediaFailure) {
	failure("identity-blocked", old.path, fmt.Errorf("indexed identity %q no longer matches this path; playback blocked", old.mediaID))
}

func storeAudioRecord(ctx context.Context, tx *sql.Tx, a AudioFileRecord, existingID int64) error {
	key, err := generateShareKey()
	if err != nil {
		return err
	}
	if existingID != 0 {
		// Locking the audio row also serializes cache invalidation with waveform publication.
		if _, err := tx.ExecContext(ctx, `DELETE FROM waveform_cache WHERE audio_file_id = $1 AND EXISTS (
			SELECT 1 FROM audio_files WHERE id = $1 AND (path IS DISTINCT FROM $2 OR size IS DISTINCT FROM $3 OR file_mtime_ns IS DISTINCT FROM $4 OR downloaded_at IS DISTINCT FROM $5)
			)`, existingID, a.Path, a.Size, a.FileMtimeNS, nullIfEmpty(a.DownloadedAt)); err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, `UPDATE audio_files SET
			media_revision = media_revision + CASE WHEN path IS DISTINCT FROM $2 OR size IS DISTINCT FROM $5 OR file_mtime_ns IS DISTINCT FROM $17 OR downloaded_at IS DISTINCT FROM $12 THEN 1 ELSE 0 END,
			path=$2, parent_path=$3, filename=$4, size=$5, mime_type=$6, title=$7, meta_artist=$8,
			upload_date=$9, webpage_url=$10, description=$11, downloaded_at=$12, source_path=$13,
			thumbnail=$14, age_limit=$15, media_id=COALESCE($16, media_id), deleted=0, identity_conflicted=FALSE, indexed_at=CURRENT_TIMESTAMP,
			file_mtime_ns=$17, share_key=COALESCE(share_key, $18)
			WHERE id=$1`, existingID, a.Path, a.ParentPath, a.Filename, a.Size, a.MimeType, a.Title, a.MetaArtist,
			a.UploadDate, a.WebpageURL, a.Description, nullIfEmpty(a.DownloadedAt), nullIfEmpty(a.SourcePath), nullIfEmpty(a.Thumbnail), a.AgeLimit, nullIfEmpty(a.MediaID), a.FileMtimeNS, key)
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO audio_files
			(path,parent_path,filename,size,mime_type,title,meta_artist,upload_date,webpage_url,description,
			downloaded_at,source_path,thumbnail,age_limit,media_id,share_key,file_mtime_ns,deleted,indexed_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,0,CURRENT_TIMESTAMP)`,
		a.Path, a.ParentPath, a.Filename, a.Size, a.MimeType, a.Title, a.MetaArtist, a.UploadDate, a.WebpageURL, a.Description,
		nullIfEmpty(a.DownloadedAt), nullIfEmpty(a.SourcePath), nullIfEmpty(a.Thumbnail), a.AgeLimit, nullIfEmpty(a.MediaID), key, a.FileMtimeNS)
	return err
}
