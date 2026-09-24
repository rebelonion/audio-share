package services

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestMediaIdentityMetadataAndFilenameFallback(t *testing.T) {
	for _, tc := range []struct{ name, metadata, want string }{
		{"title [video].m4a", `{"id":"metadata-id","title":"Title"}`, "metadata-id"},
		{"title [video].opus", `{"title":"Title"}`, "video"},
		{"title [category] [video].MP3", `{"id":""}`, "video"},
		{"title [video].flac", `{}`, "video"},
		{"title [category] extra.m4a", `{}`, ""},
		{"title.m4a", `{"id":"metadata-id"}`, "metadata-id"},
		{"title [].m4a", `{}`, ""},
	} {
		t.Run(tc.name+tc.metadata, func(t *testing.T) {
			dir := t.TempDir()
			full := filepath.Join(dir, tc.name)
			if err := os.WriteFile(full, []byte("audio"), 0600); err != nil {
				t.Fatal(err)
			}
			if tc.metadata != "" {
				if err := os.WriteFile(full[:len(full)-len(filepath.Ext(full))]+".info.json", []byte(tc.metadata), 0600); err != nil {
					t.Fatal(err)
				}
			}
			info, err := os.Stat(full)
			if err != nil {
				t.Fatal(err)
			}
			a, err := readAudioRecord(context.Background(), NewFileSystemService(dir+":Audio"), "audio", "", full, info, func(string, string, error) {})
			if err != nil {
				t.Fatal(err)
			}
			if a.MediaID != tc.want {
				t.Fatalf("id=%q want %q", a.MediaID, tc.want)
			}
		})
	}
}

func TestMediaIdentityRequiresSidecar(t *testing.T) {
	for _, name := range []string{"title.m4a", "title [video].m4a"} {
		t.Run(name, func(t *testing.T) {
			dir := t.TempDir()
			full := filepath.Join(dir, name)
			if err := os.WriteFile(full, []byte("audio"), 0600); err != nil {
				t.Fatal(err)
			}
			info, err := os.Stat(full)
			if err != nil {
				t.Fatal(err)
			}
			var reported bool
			_, err = readAudioRecord(context.Background(), NewFileSystemService(dir+":Audio"), "audio", "", full, info, func(step, path string, err error) {
				reported = step == "read" && path == full[:len(full)-len(filepath.Ext(full))]+".info.json" && os.IsNotExist(err)
			})
			if !os.IsNotExist(err) || !reported {
				t.Fatalf("missing sidecar: err=%v reported=%v", err, reported)
			}
		})
	}
}
