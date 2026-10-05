package services

import (
	"testing"
)

func TestParseChaptersNormalizesProbeOutput(t *testing.T) {
	probe := []byte(`{"chapters": [
		{"id": 1, "start_time": "181.130000", "end_time": "4115.000000", "tags": {"title": " Main stream "}},
		{"id": 0, "start_time": "0.000000", "end_time": "181.130000", "tags": {"title": "[SponsorBlock]: Intro"}},
		{"id": 2, "start_time": "4115.000000", "end_time": "4115.000000", "tags": {"title": "empty"}},
		{"id": 3, "start_time": "4120.000000", "end_time": "4200.000000"}
	]}`)
	chapters, err := parseChapters(probe)
	if err != nil {
		t.Fatal(err)
	}
	want := []Chapter{
		{Title: "[SponsorBlock]: Intro", Start: 0, End: 181.13},
		{Title: "Main stream", Start: 181.13, End: 4115},
		{Title: "Chapter 3", Start: 4120, End: 4200},
	}
	if len(chapters) != len(want) {
		t.Fatalf("got %d chapters, want %d: %+v", len(chapters), len(want), chapters)
	}
	for i := range want {
		if chapters[i] != want[i] {
			t.Errorf("chapter %d = %+v, want %+v", i, chapters[i], want[i])
		}
	}
	if got := encodeChapters(nil); got != nil {
		t.Errorf("encodeChapters(nil) = %v, want SQL NULL so the probe is retried", got)
	}
	if got := encodeChapters([]Chapter{}); got != "[]" {
		t.Errorf("encodeChapters(empty) = %v, want []", got)
	}
}

func TestParseChaptersWithoutChapters(t *testing.T) {
	chapters, err := parseChapters([]byte(`{"chapters": []}`))
	if err != nil || chapters == nil || len(chapters) != 0 {
		t.Fatalf("got %v, %v; want a non-nil empty slice", chapters, err)
	}
	if _, err := parseChapters([]byte(`not json`)); err == nil {
		t.Fatal("expected parse error")
	}
}
