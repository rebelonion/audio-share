package services

import (
	"reflect"
	"regexp"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func newMockStatsService(t *testing.T) (*SearchService, sqlmock.Sqlmock) {
	t.Helper()
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create mock database: %v", err)
	}
	t.Cleanup(func() {
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Errorf("unmet database expectations: %v", err)
		}
		db.Close()
	})
	return NewSearchService(&Database{db: db}, nil, nil), mock
}

func TestGetUnavailableStatsGroupsCurrentUnavailableFilesByUTCDay(t *testing.T) {
	service, mock := newMockStatsService(t)
	mock.ExpectQuery(regexp.QuoteMeta(`
		SELECT (af.unavailable_at AT TIME ZONE 'UTC')::date::text as day,
		       COALESCE(NULLIF(f.name, ''), NULLIF(af.source_path, ''), 'Unknown channel') as name,
		       COALESCE(af.source_path, '') as path, COUNT(*) as count
		FROM audio_files af
		LEFT JOIN folders f ON f.path = af.source_path
		WHERE af.unavailable_at IS NOT NULL AND af.deleted = 0
		GROUP BY 1, 2, 3
		ORDER BY 1, count DESC, name, path
	`)).WillReturnRows(sqlmock.NewRows([]string{"day", "name", "path", "count"}).
		AddRow("2026-04-09", "Channel A", "channel-a", 30).
		AddRow("2026-04-09", "Channel B", "channel-b", 5).
		AddRow("2026-04-09", "Unknown channel", "", 2).
		AddRow("2026-04-11", "missing-folder", "missing-folder", 2))

	stats, err := service.GetUnavailableStats()
	if err != nil {
		t.Fatalf("GetUnavailableStats: %v", err)
	}
	if stats.Total != 39 {
		t.Fatalf("total = %d, want 39", stats.Total)
	}
	want := []UnavailableDayStat{
		{Date: "2026-04-09", Count: 37, Sources: []UnavailableSourceCount{
			{Name: "Channel A", Path: "channel-a", Count: 30},
			{Name: "Channel B", Path: "channel-b", Count: 5},
			{Name: "Unknown channel", Path: "", Count: 2},
		}},
		{Date: "2026-04-11", Count: 2, Sources: []UnavailableSourceCount{
			{Name: "missing-folder", Path: "missing-folder", Count: 2},
		}},
	}
	if !reflect.DeepEqual(stats.Days, want) {
		t.Fatalf("unexpected days: %#v", stats.Days)
	}
}

func TestGetUnavailableStatsReturnsEmptyDaysInsteadOfNull(t *testing.T) {
	service, mock := newMockStatsService(t)
	mock.ExpectQuery(regexp.QuoteMeta(`
		SELECT (af.unavailable_at AT TIME ZONE 'UTC')::date::text as day,
		       COALESCE(NULLIF(f.name, ''), NULLIF(af.source_path, ''), 'Unknown channel') as name,
		       COALESCE(af.source_path, '') as path, COUNT(*) as count
		FROM audio_files af
		LEFT JOIN folders f ON f.path = af.source_path
		WHERE af.unavailable_at IS NOT NULL AND af.deleted = 0
		GROUP BY 1, 2, 3
		ORDER BY 1, count DESC, name, path
	`)).WillReturnRows(sqlmock.NewRows([]string{"day", "name", "path", "count"}))

	stats, err := service.GetUnavailableStats()
	if err != nil {
		t.Fatalf("GetUnavailableStats: %v", err)
	}
	if stats.Days == nil || len(stats.Days) != 0 {
		t.Fatalf("days = %#v, want an empty non-nil slice", stats.Days)
	}
}
