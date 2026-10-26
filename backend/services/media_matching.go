package services

import (
	"database/sql"
	"fmt"
	"log"
)

type indexedMedia struct {
	id                                  int64
	path, filename, mediaID, sourcePath string
	downloadedAt                        sql.NullTime
	deleted, identityConflicted         bool
	// Not seen on disk for mediaMergeGrace.
	stale bool
}

type mediaUpdate struct {
	audio AudioFileRecord
	old   indexedMedia
}

type mediaCatalog struct {
	owners  map[string]indexedMedia
	history map[string][]indexedMedia
	byID    map[string][]indexedMedia
}

// Stored IDs are authoritative. Initial exact-path backfill trusts the current
// sidecar; historical filename hints are only needed without an active path match.
func newMediaCatalog(records []indexedMedia, files []AudioFileRecord) mediaCatalog {
	c := mediaCatalog{
		owners:  make(map[string]indexedMedia),
		history: make(map[string][]indexedMedia),
		byID:    make(map[string][]indexedMedia),
	}
	currentIDs := make(map[string]string)
	for _, a := range files {
		currentIDs[a.Path] = a.MediaID
	}
	for _, old := range records {
		if old.mediaID == "" {
			if currentID, present := currentIDs[old.path]; !old.deleted && present {
				old.mediaID = currentID
			} else {
				old.mediaID = mediaIDFromFilename(old.filename)
			}
		}
		if old.deleted {
			c.history[old.path] = append(c.history[old.path], old)
		} else {
			c.owners[old.path] = old
		}
		if old.mediaID != "" {
			c.byID[old.mediaID] = append(c.byID[old.mediaID], old)
		}
	}
	return c
}

// Once a duplicate file has stayed gone for the grace period, its leftover records
// fold into the record that still owns the only file with that ID. Until then a
// returning duplicate can reclaim its record. Blocked identities stay manual.
// Returns loser record ID -> survivor record ID.
func (c mediaCatalog) merges(files []AudioFileRecord) map[int64]int64 {
	onDisk := make(map[string]bool)
	paths := make(map[string][]string)
	for _, a := range files {
		onDisk[a.Path] = true
		if a.MediaID != "" {
			paths[a.MediaID] = append(paths[a.MediaID], a.Path)
		}
	}
	merges := make(map[int64]int64)
	for id, matches := range paths {
		records := c.byID[id]
		if len(matches) != 1 || len(records) < 2 {
			continue
		}
		survivor, exists := c.owners[matches[0]]
		if !exists || survivor.mediaID != id || survivor.identityConflicted {
			continue
		}
		var losers []int64
		for _, record := range records {
			if record.id == survivor.id {
				continue
			}
			if record.identityConflicted || onDisk[record.path] {
				losers = nil
				break
			}
			if record.stale {
				losers = append(losers, record.id)
			}
		}
		for _, loser := range losers {
			merges[loser] = survivor.id
		}
	}
	return merges
}

// A re-download indexed while its original was still on disk gets its own record.
// Once the original file is gone, the re-download's record folds into the original so
// the original share key, history and likes follow the file. Only an unambiguous pair
// qualifies: one file with the ID, owned by one of exactly two records, downloaded
// strictly later than the other. Duplicates without that ordering wait for merges.
// Returns loser record ID -> survivor record ID.
func (c mediaCatalog) replacements(files []AudioFileRecord, recoverOnly bool, pathMissing func(string) (bool, error)) (map[int64]int64, error) {
	onDisk := make(map[string]bool)
	paths := make(map[string][]string)
	for _, a := range files {
		onDisk[a.Path] = true
		if a.MediaID != "" {
			paths[a.MediaID] = append(paths[a.MediaID], a.Path)
		}
	}
	merges := make(map[int64]int64)
	for id, matches := range paths {
		records := c.byID[id]
		if len(matches) != 1 || len(records) != 2 {
			continue
		}
		replacement, exists := c.owners[matches[0]]
		if !exists || replacement.mediaID != id || replacement.identityConflicted {
			continue
		}
		original := records[0]
		if original.id == replacement.id {
			original = records[1]
		}
		// Playback recovery only repairs active records; restoring deleted ones waits for the index.
		if original.identityConflicted || onDisk[original.path] || (recoverOnly && original.deleted) {
			continue
		}
		if !original.downloadedAt.Valid || !replacement.downloadedAt.Valid || !replacement.downloadedAt.Time.After(original.downloadedAt.Time) {
			continue
		}
		missing, err := pathMissing(original.path)
		if err != nil {
			return nil, err
		}
		if missing {
			merges[replacement.id] = original.id
		}
	}
	return merges, nil
}

func (c mediaCatalog) conflicts(files []AudioFileRecord) []indexedMedia {
	var conflicts []indexedMedia
	for _, a := range files {
		if old, exists := c.owners[a.Path]; exists && old.mediaID != "" && a.MediaID != "" && old.mediaID != a.MediaID {
			conflicts = append(conflicts, old)
		}
	}
	return conflicts
}

// Matching is independent of database writes. Only a rename may need a final
// existence check of an old path that was absent from the directory snapshot.
func (c mediaCatalog) plan(files []AudioFileRecord, recoverOnly bool, pathMissing func(string) (bool, error), failure mediaFailure) ([]mediaUpdate, error) {
	diskCounts := make(map[string]int)
	currentIDs := make(map[string]string)
	pathsByID := make(map[string]string)
	for _, a := range files {
		currentIDs[a.Path] = a.MediaID
		if a.MediaID != "" {
			diskCounts[a.MediaID]++
			pathsByID[a.MediaID] = a.Path
		}
	}
	for id, count := range diskCounts {
		if count == 1 && len(c.byID[id]) > 1 {
			// Leftover records are harmless while the only file keeps its own record.
			if owner, exists := c.owners[pathsByID[id]]; exists && owner.mediaID == id {
				continue
			}
		}
		if count > 1 || len(c.byID[id]) > 1 {
			err := fmt.Errorf("ambiguous media ID %q: %d files, %d records; keeping records separate", id, count, len(c.byID[id]))
			log.Printf("%s: %v", files[0].ParentPath, err)
			if !recoverOnly {
				failure("identity-ambiguous", files[0].ParentPath, err)
			}
		}
	}
	var updates []mediaUpdate
	assigned := make(map[int64]string)
	conflict := func(path, message string) error {
		err := fmt.Errorf("%w: %s", errIncompleteAudioDirectory, message)
		failure("identity", path, err)
		return err
	}
	for _, a := range files {
		old, exact := c.owners[a.Path]
		if exact && old.mediaID != "" && a.MediaID != "" && old.mediaID != a.MediaID {
			if recoverOnly {
				continue
			}
			old, exact = indexedMedia{}, false
		}
		if !recoverOnly && !exact {
			var historical []indexedMedia
			for _, candidate := range c.history[a.Path] {
				if candidate.mediaID == a.MediaID {
					historical = append(historical, candidate)
				}
			}
			if len(historical) > 1 {
				return nil, conflict(a.Path, "multiple historical records match this path and media identity")
			}
			if len(historical) == 1 {
				old, exact = historical[0], true
			}
		}
		if !exact && a.MediaID != "" {
			candidates := c.byID[a.MediaID]
			if diskCounts[a.MediaID] > 1 || len(candidates) > 1 {
				for _, candidate := range candidates {
					if candidate.identityConflicted {
						return nil, conflict(a.Path, "previously blocked identity still has ambiguous replacements")
					}
				}
			}
			if diskCounts[a.MediaID] == 1 && len(candidates) == 1 {
				candidate := candidates[0]
				if currentID := currentIDs[candidate.path]; !recoverOnly && (candidate.deleted || (currentID != "" && currentID != candidate.mediaID)) {
					old = candidate
				} else if missing, err := pathMissing(candidate.path); err != nil {
					return nil, err
				} else if missing {
					old = candidate
				}
			}
		}
		if recoverOnly && (old.id == 0 || old.deleted || exact) {
			continue
		}
		if old.id != 0 {
			if _, used := assigned[old.id]; used {
				return nil, conflict(a.Path, "multiple files match the same indexed record")
			}
			assigned[old.id] = a.Path
		}
		if a.MediaID == "" {
			a.MediaID = old.mediaID
		}
		updates = append(updates, mediaUpdate{a, old})
	}
	for _, update := range updates {
		if occupant, exists := c.owners[update.audio.Path]; exists && occupant.id != update.old.id {
			if destination, moving := assigned[occupant.id]; !moving || destination == occupant.path {
				retired := !recoverOnly && occupant.mediaID != "" && update.audio.MediaID != "" && occupant.mediaID != update.audio.MediaID
				if !retired || diskCounts[occupant.mediaID] != 0 || diskCounts[update.audio.MediaID] != 1 || len(c.byID[update.audio.MediaID]) > 1 {
					return nil, conflict(update.audio.Path, "path belongs to a different media identity without a unique replacement")
				}
			}
		}
	}
	return updates, nil
}
