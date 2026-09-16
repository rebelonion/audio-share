package services

import (
	"bytes"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

// ExportAssets adds immutable assets without deleting files from older releases.
// Each file becomes visible atomically; an existing name must have equal content.
func ExportAssets(staticDir, destination string) error {
	source := filepath.Join(staticDir, "assets")
	count := 0
	err := filepath.WalkDir(source, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("asset symlinks are not supported: %s", path)
		}
		rel, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		target := filepath.Join(destination, rel)
		if entry.IsDir() {
			return os.MkdirAll(target, 0755)
		}
		if !entry.Type().IsRegular() {
			return fmt.Errorf("not a regular asset: %s", path)
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if err := publishAsset(target, data); err != nil {
			return err
		}
		count++
		return nil
	})
	if err != nil {
		return err
	}
	if count == 0 {
		return fmt.Errorf("no frontend assets found in %s", source)
	}
	return nil
}

func publishAsset(target string, data []byte) error {
	f, err := os.CreateTemp(filepath.Dir(target), ".asset-*")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	defer f.Close()
	if _, err := f.Write(data); err != nil {
		return err
	}
	if err := f.Chmod(0644); err != nil {
		return err
	}
	if err := f.Sync(); err != nil {
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	if err := os.Link(f.Name(), target); err != nil {
		if !os.IsExist(err) {
			return err
		}
		existing, readErr := os.ReadFile(target)
		if readErr != nil {
			return readErr
		}
		if !bytes.Equal(existing, data) {
			return fmt.Errorf("immutable asset collision: %s", target)
		}
	}
	return nil
}
