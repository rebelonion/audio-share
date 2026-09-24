package services

import (
	"errors"
	"path/filepath"
	"reflect"
	"slices"
	"testing"
)

func TestMediaMatchingScenarioMatrix(t *testing.T) {
	record := func(id int64, path, mediaID string, deleted bool) indexedMedia {
		return indexedMedia{id: id, path: path, filename: filepath.Base(path), mediaID: mediaID, deleted: deleted}
	}
	file := func(path, mediaID string) AudioFileRecord {
		return AudioFileRecord{Path: path, Filename: filepath.Base(path), MediaID: mediaID}
	}
	cases := []struct {
		name               string
		records            []indexedMedia
		files              []AudioFileRecord
		want               map[string]int64
		blocked            []int64
		deferred, recovery bool
	}{
		{name: "unchanged",
			records: []indexedMedia{record(1, "a", "A", false)},
			files:   []AudioFileRecord{file("a", "A")},
			want:    map[string]int64{"a": 1}},
		{name: "same-path edit without incoming ID",
			records: []indexedMedia{record(1, "a", "A", false)},
			files:   []AudioFileRecord{file("a", "")},
			want:    map[string]int64{"a": 1}},
		{name: "new recording",
			files: []AudioFileRecord{file("a", "A")},
			want:  map[string]int64{"a": 0}},
		{name: "rename",
			records: []indexedMedia{record(1, "a", "A", false)},
			files:   []AudioFileRecord{file("b", "A")},
			want:    map[string]int64{"b": 1}},
		{name: "swap",
			records: []indexedMedia{record(1, "a", "A", false), record(2, "b", "B", false)},
			files:   []AudioFileRecord{file("a", "B"), file("b", "A")},
			want:    map[string]int64{"a": 2, "b": 1},
			blocked: []int64{1, 2}},
		{name: "new occupant",
			records: []indexedMedia{record(1, "a", "A", false)},
			files:   []AudioFileRecord{file("a", "B")},
			want:    map[string]int64{"a": 0},
			blocked: []int64{1}},
		{name: "deleted filename reuse",
			records: []indexedMedia{record(1, "a", "A", true)},
			files:   []AudioFileRecord{file("a", "B")},
			want:    map[string]int64{"a": 0}},
		{name: "restore original path",
			records: []indexedMedia{record(1, "a", "A", true)},
			files:   []AudioFileRecord{file("a", "A")},
			want:    map[string]int64{"a": 1}},
		{name: "restore elsewhere",
			records: []indexedMedia{record(1, "a", "A", true)},
			files:   []AudioFileRecord{file("b", "A")},
			want:    map[string]int64{"b": 1}},
		{name: "duplicate IDs keep exact matches",
			records: []indexedMedia{record(1, "a", "A", false), record(2, "b", "A", false)},
			files:   []AudioFileRecord{file("a", "A"), file("b", "A")},
			want:    map[string]int64{"a": 1, "b": 2}},
		{name: "restore duplicate ID by exact historical path",
			records: []indexedMedia{record(1, "a", "A", true), record(2, "b", "A", false)},
			files:   []AudioFileRecord{file("a", "A"), file("b", "A")},
			want:    map[string]int64{"a": 1, "b": 2}},
		{name: "ambiguous historical path",
			records:  []indexedMedia{record(1, "a", "A", true), record(2, "a", "A", true)},
			files:    []AudioFileRecord{file("a", "A")},
			deferred: true},
		{name: "ambiguous rename stays separate",
			records: []indexedMedia{record(1, "a", "A", true), record(2, "b", "A", true)},
			files:   []AudioFileRecord{file("c", "A")},
			want:    map[string]int64{"c": 0}},
		{name: "original still present",
			records: []indexedMedia{record(1, "a", "A", false)},
			files:   []AudioFileRecord{file("a", "A"), file("b", "A")},
			want:    map[string]int64{"a": 1, "b": 0}},
		{name: "legacy rename and path reuse",
			records: []indexedMedia{record(1, "original [A].m4a", "", false)},
			files:   []AudioFileRecord{file("original [A].m4a", "B"), file("renamed [A].m4a", "A")},
			want:    map[string]int64{"original [A].m4a": 1, "renamed [A].m4a": 0}},
		{name: "legacy filename swap",
			records: []indexedMedia{record(1, "old [A].m4a", "", false), record(2, "old [B].m4a", "", false)},
			files:   []AudioFileRecord{file("old [A].m4a", "B"), file("old [B].m4a", "A")},
			want:    map[string]int64{"old [A].m4a": 1, "old [B].m4a": 2}},
		{name: "sidecar ID overrides title tags on initial backfill",
			records: []indexedMedia{record(1, "track [Compilation].m4a", "", false)},
			files:   []AudioFileRecord{file("track [Compilation].m4a", "real-id")},
			want:    map[string]int64{"track [Compilation].m4a": 1}},
		{name: "legacy filename still matches a missing path",
			records: []indexedMedia{record(1, "old [A].m4a", "", false)},
			files:   []AudioFileRecord{file("new [A].m4a", "A")},
			want:    map[string]int64{"new [A].m4a": 1}},
		{name: "stored ID overrides filename",
			records: []indexedMedia{record(1, "old [A].m4a", "B", false)},
			files:   []AudioFileRecord{file("new", "B")},
			want:    map[string]int64{"new": 1}},
		{name: "unknown identity backfill",
			records: []indexedMedia{record(1, "a", "", false)},
			files:   []AudioFileRecord{file("a", "A")},
			want:    map[string]int64{"a": 1}},
		{name: "unknown exact path backfills even with a duplicate ID",
			records: []indexedMedia{record(1, "a", "", false), record(2, "b", "B", false)},
			files:   []AudioFileRecord{file("a", "B")},
			want:    map[string]int64{"a": 1}},
		{name: "unknown historical exact path",
			records: []indexedMedia{record(1, "a", "", true)},
			files:   []AudioFileRecord{file("a", "")},
			want:    map[string]int64{"a": 1}},
		{name: "recovery rename only",
			records:  []indexedMedia{record(1, "a", "A", false)},
			files:    []AudioFileRecord{file("b", "A"), file("c", "C")},
			want:     map[string]int64{"b": 1},
			recovery: true},
		{name: "recovery skips deleted",
			records:  []indexedMedia{record(1, "a", "A", true)},
			files:    []AudioFileRecord{file("b", "A")},
			want:     map[string]int64{},
			recovery: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// Decisions must not depend on file traversal or database row order.
			for _, reverseRecords := range []bool{false, true} {
				for _, reverseFiles := range []bool{false, true} {
					records, files := slices.Clone(tc.records), slices.Clone(tc.files)
					if reverseRecords {
						slices.Reverse(records)
					}
					if reverseFiles {
						slices.Reverse(files)
					}
					catalog := newMediaCatalog(records, files)
					var blocked []int64
					for _, old := range catalog.conflicts(files) {
						blocked = append(blocked, old.id)
					}
					slices.Sort(blocked)
					if !reflect.DeepEqual(blocked, tc.blocked) {
						t.Fatalf("blocked=%v want=%v", blocked, tc.blocked)
					}
					updates, err := catalog.plan(files, tc.recovery, func(path string) (bool, error) {
						for _, a := range files {
							if a.Path == path {
								return false, nil
							}
						}
						return true, nil
					}, func(string, string, error) {})
					if tc.deferred {
						if !errors.Is(err, errIncompleteAudioDirectory) {
							t.Fatalf("error=%v want deferral", err)
						}
						continue
					}
					if err != nil {
						t.Fatal(err)
					}
					got, assigned := make(map[string]int64), make(map[int64]bool)
					for _, update := range updates {
						got[update.audio.Path] = update.old.id
						if update.old.id != 0 {
							if assigned[update.old.id] {
								t.Fatalf("record %d assigned twice", update.old.id)
							}
							assigned[update.old.id] = true
							if update.old.mediaID != "" && update.audio.MediaID != update.old.mediaID {
								t.Fatalf("record %d changed identity", update.old.id)
							}
						}
					}
					if !reflect.DeepEqual(got, tc.want) {
						t.Fatalf("matches=%v want=%v", got, tc.want)
					}
				}
			}
		})
	}
}
