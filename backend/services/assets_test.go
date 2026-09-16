package services

import (
	"os"
	"path/filepath"
	"testing"
)

func TestExportAssetsPreservesOldFilesAndRejectsCollisions(t *testing.T) {
	source, dest := t.TempDir(), t.TempDir()
	os.Mkdir(filepath.Join(source, "assets"), 0755)
	write := func(name, data string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(source, "assets", name), []byte(data), 0644); err != nil {
			t.Fatal(err)
		}
	}
	write("old-hash.js", "old")
	if err := ExportAssets(source, dest); err != nil {
		t.Fatal(err)
	}
	os.Remove(filepath.Join(source, "assets", "old-hash.js"))
	write("new-hash.js", "new")
	for range 2 {
		if err := ExportAssets(source, dest); err != nil {
			t.Fatal(err)
		}
	}
	old, err := os.ReadFile(filepath.Join(dest, "old-hash.js"))
	if err != nil || string(old) != "old" {
		t.Fatalf("old asset lost: %s %v", old, err)
	}
	write("new-hash.js", "collision")
	if err := ExportAssets(source, dest); err == nil {
		t.Fatal("accepted a collision")
	}
	data, _ := os.ReadFile(filepath.Join(dest, "new-hash.js"))
	if string(data) != "new" {
		t.Fatalf("overwrote asset: %s", data)
	}
}
