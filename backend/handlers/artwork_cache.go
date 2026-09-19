package handlers

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/gofrs/flock"
)

const artworkStateFile = ".artwork-state.json"
const artworkReconcileInterval = 5 * time.Minute

type artworkState struct {
	Bytes   int64     `json:"bytes"`
	Checked time.Time `json:"checked"`
}

type artworkEntry struct {
	name string
	size int64
	used time.Time
}

func (c *artworkCache) lockDisk() (*flock.Flock, error) {
	lock := flock.New(filepath.Join(c.dir, ".artwork.lock"))
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	locked, err := lock.TryLockContext(ctx, 10*time.Millisecond)
	if err != nil || !locked {
		lock.Close()
		if err != nil {
			return nil, err
		}
		return nil, ctx.Err()
	}
	return lock, nil
}

// Writers hold the disk lock while loading and updating the shared byte count.
func (c *artworkCache) loadState() (artworkState, []artworkEntry, error) {
	data, err := os.ReadFile(filepath.Join(c.dir, artworkStateFile))
	if err != nil && !os.IsNotExist(err) {
		return artworkState{}, nil, err
	}
	var state artworkState
	if err == nil && json.Unmarshal(data, &state) == nil && state.Bytes >= 0 &&
		!state.Checked.After(time.Now()) && time.Since(state.Checked) < artworkReconcileInterval {
		return state, nil, nil
	}
	return c.reconcile()
}

func (c *artworkCache) reconcile() (artworkState, []artworkEntry, error) {
	files, err := os.ReadDir(c.dir)
	if err != nil {
		return artworkState{}, nil, err
	}
	entries := make([]artworkEntry, 0, len(files))
	state := artworkState{Checked: time.Now()}
	for _, file := range files {
		if file.IsDir() {
			continue
		}
		// All temporary-file writers hold the same disk lock as reconciliation.
		if strings.HasPrefix(file.Name(), "artwork-") && strings.HasSuffix(file.Name(), ".tmp") {
			if err := os.Remove(filepath.Join(c.dir, file.Name())); err != nil && !os.IsNotExist(err) {
				return artworkState{}, nil, err
			}
			continue
		}
		if filepath.Ext(file.Name()) != ".jpg" {
			continue
		}
		info, err := file.Info()
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			return artworkState{}, nil, err
		}
		entries = append(entries, artworkEntry{file.Name(), info.Size(), info.ModTime()})
		state.Bytes += info.Size()
	}
	return state, entries, nil
}

func (c *artworkCache) write(name string, data []byte) error {
	if err := c.init(); err != nil {
		return err
	}
	if err := os.MkdirAll(c.dir, 0700); err != nil {
		return err
	}
	lock, err := c.lockDisk()
	if err != nil {
		return err
	}
	defer lock.Close()
	state, entries, err := c.loadState()
	if err != nil {
		return err
	}

	incoming := int64(len(data))
	publish := incoming <= c.limit
	if _, err := os.Stat(filepath.Join(c.dir, name)); err == nil {
		publish = false
	} else if !os.IsNotExist(err) {
		return err
	}
	if !publish {
		incoming = 0
	}

	if state.Bytes+incoming > c.limit && entries == nil {
		state, entries, err = c.reconcile()
		if err != nil {
			return err
		}
	}
	// A stopped writer leaves no valid count; the next writer rebuilds it from disk.
	if err := os.Remove(filepath.Join(c.dir, artworkStateFile)); err != nil && !os.IsNotExist(err) {
		return err
	}
	if state.Bytes+incoming > c.limit {
		sort.Slice(entries, func(i, j int) bool { return entries[i].used.Before(entries[j].used) })
		target := c.limit - max(incoming, c.limit/10)
		for _, entry := range entries {
			if state.Bytes <= target {
				break
			}
			if err := os.Remove(filepath.Join(c.dir, entry.name)); err != nil && !os.IsNotExist(err) {
				return err
			}
			state.Bytes -= entry.size
		}
	}
	if publish {
		if err := c.writeFile(name, data); err != nil {
			return err
		}
		state.Bytes += incoming
	}
	encoded, err := json.Marshal(state)
	if err != nil {
		return err
	}
	return c.writeFile(artworkStateFile, encoded)
}

func (c *artworkCache) writeFile(name string, data []byte) error {
	tmp, err := os.CreateTemp(c.dir, "artwork-*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	_, err = tmp.Write(data)
	closeErr := tmp.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	return os.Rename(tmp.Name(), filepath.Join(c.dir, name))
}
