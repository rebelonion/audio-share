package services

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestIntegrationSearchUnknownDates(t *testing.T) {
	db := integrationDatabase(t)
	if err := db.Migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	_, err := db.db.Exec(`INSERT INTO audio_files(path,parent_path,filename,upload_date) VALUES
 ('root/empty.m4a','root','empty.m4a',''),
 ('root/invalid.m4a','root','invalid.m4a','20260230'),
 ('root/known.m4a','root','known.m4a','20240229');
 INSERT INTO folders(path,parent_path,folder_name,name,upload_date) VALUES
 ('root/empty','','empty','Empty',''),
 ('root/invalid','','invalid','Invalid','20260230'),
 ('root/known','','known','Known','20240229')`)
	if err != nil {
		t.Fatal(err)
	}
	rows, total, err := NewSearchService(db, nil, nil).Search("", 50, 0, SearchOptions{})
	if err != nil || total != 6 {
		t.Fatalf("total=%d err=%v", total, err)
	}
	for _, r := range rows {
		want := ""
		if r.Path == "root/known.m4a" || r.Path == "root/known" {
			want = "2024-02-29"
		}
		if r.ModifiedAt != want {
			t.Errorf("%s date=%q want=%q", r.Path, r.ModifiedAt, want)
		}
	}
}

func TestIntegrationSearchUnknownDatesFilteringAndOrdering(t *testing.T) {
	db := integrationDatabase(t)
	if err := db.Migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	_, err := db.db.Exec(`INSERT INTO audio_files(path,parent_path,filename,upload_date) VALUES
 ('root/empty.m4a','root','empty.m4a',''),
 ('root/null.m4a','root','null.m4a',NULL),
 ('root/bad-day.m4a','root','bad-day.m4a','20260230'),
 ('root/bad-month.m4a','root','bad-month.m4a','20261301'),
 ('root/bad-leap.m4a','root','bad-leap.m4a','20250229'),
 ('root/malformed.m4a','root','malformed.m4a','not-a-date'),
 ('root/old.m4a','root','old.m4a','18990101'),
 ('root/new.m4a','root','new.m4a','20260101');
 INSERT INTO folders(path,parent_path,folder_name,name,upload_date) VALUES
 ('root/empty','','empty','Empty',''),
 ('root/null','','null','Null',NULL),
 ('root/bad-day','','bad-day','Bad day','20260230'),
 ('root/bad-month','','bad-month','Bad month','20261301'),
 ('root/bad-leap','','bad-leap','Bad leap','20250229'),
 ('root/malformed','','malformed','Malformed','not-a-date'),
 ('root/old','','old','Old','18990101'),
 ('root/new','','new','New','20260101')`)
	if err != nil {
		t.Fatal(err)
	}
	search := NewSearchService(db, nil, nil)
	for _, kind := range []string{"audio", "folder", ""} {
		t.Run("type="+kind, func(t *testing.T) {
			multiplier := 1
			if kind == "" {
				multiplier = 2
			}
			for _, tc := range []struct{ name, from, to, want string }{
				{"before", "", "1900-01-01", "1899-01-01"},
				{"after", "2000-01-01", "", "2026-01-01"},
				{"range", "1899-01-01", "1899-01-01", "1899-01-01"},
			} {
				t.Run(tc.name, func(t *testing.T) {
					rows, total, err := search.Search("", 50, 0, SearchOptions{Type: kind, DateFrom: tc.from, DateTo: tc.to})
					if err != nil || total != multiplier || len(rows) != multiplier {
						t.Fatalf("total=%d rows=%d err=%v", total, len(rows), err)
					}
					for _, r := range rows {
						if r.ModifiedAt != tc.want {
							t.Errorf("%s date=%q", r.Path, r.ModifiedAt)
						}
					}
				})
			}
			for _, sort := range []string{"date_asc", "date_desc"} {
				rows, total, err := search.Search("", 50, 0, SearchOptions{Type: kind, Sort: sort})
				if err != nil || total != 8*multiplier || len(rows) != 8*multiplier {
					t.Fatalf("total=%d rows=%d err=%v", total, len(rows), err)
				}
				first, second := "1899-01-01", "2026-01-01"
				if sort == "date_desc" {
					first, second = second, first
				}
				for n, r := range rows {
					want := ""
					if n < multiplier {
						want = first
					} else if n < 2*multiplier {
						want = second
					}
					if r.ModifiedAt != want {
						t.Errorf("%s row %d date=%q want=%q", sort, n, r.ModifiedAt, want)
					}
				}
				tail, _, err := search.Search("", 2*multiplier, 2*multiplier, SearchOptions{Type: kind, Sort: sort})
				if err != nil || len(tail) != 2*multiplier {
					t.Fatalf("pagination: %v rows=%d", err, len(tail))
				}
				for _, r := range tail {
					if r.ModifiedAt != "" {
						t.Errorf("dated row on unknown-date page: %+v", r)
					}
				}
			}
		})
	}
}

func TestIntegrationFolderDatesFollowDatedDescendants(t *testing.T) {
	f := newMediaFixture(t)
	f.write(t, "creator/year/unknown.m4a", "unknown", "audio")
	check := func(want string) {
		t.Helper()
		for _, path := range []string{"audio", "audio/creator", "audio/creator/year"} {
			var got string
			if err := f.db.db.QueryRow("SELECT upload_date FROM folders WHERE path=$1", path).Scan(&got); err != nil {
				t.Fatal(err)
			}
			if got != want {
				t.Errorf("%s: date=%q want=%q", path, got, want)
			}
		}
	}
	f.index(t)
	check("")
	f.write(t, "creator/year/dated.m4a", "dated", "audio")
	sidecar := filepath.Join(f.dir, "creator/year/dated.info.json")
	for _, date := range []string{"20240229", "20260230", "20260101", ""} {
		if err := os.WriteFile(sidecar, []byte(`{"id":"dated","upload_date":"`+date+`"}`), 0600); err != nil {
			t.Fatal(err)
		}
		f.index(t)
		want := date
		if date == "20260230" {
			want = ""
		}
		check(want)
	}
	if err := os.WriteFile(sidecar, []byte(`{"id":"dated","upload_date":"20260101"}`), 0600); err != nil {
		t.Fatal(err)
	}
	f.index(t)
	check("20260101")
	if _, err := f.db.db.Exec(`UPDATE audio_files SET indexed_at=CURRENT_TIMESTAMP - INTERVAL '1 hour' WHERE filename='dated.m4a'`); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(f.dir, "creator/year/dated.m4a")); err != nil {
		t.Fatal(err)
	}
	f.index(t)
	check("")
}
