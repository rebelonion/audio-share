package services

import (
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
		SELECT (unavailable_at AT TIME ZONE 'UTC')::date::text as day, COUNT(*) as count
		FROM audio_files
		WHERE unavailable_at IS NOT NULL AND deleted = 0
		GROUP BY 1
		ORDER BY 1
	`)).WillReturnRows(sqlmock.NewRows([]string{"day", "count"}).
		AddRow("2026-04-09", 37).
		AddRow("2026-04-11", 2))

	stats, err := service.GetUnavailableStats()
	if err != nil {
		t.Fatalf("GetUnavailableStats: %v", err)
	}
	if stats.Total != 39 {
		t.Fatalf("total = %d, want 39", stats.Total)
	}
	if len(stats.Days) != 2 || stats.Days[0].Date != "2026-04-09" || stats.Days[1].Count != 2 {
		t.Fatalf("unexpected days: %#v", stats.Days)
	}
}

func TestGetUnavailableStatsReturnsEmptyDaysInsteadOfNull(t *testing.T) {
	service, mock := newMockStatsService(t)
	mock.ExpectQuery(regexp.QuoteMeta(`
		SELECT (unavailable_at AT TIME ZONE 'UTC')::date::text as day, COUNT(*) as count
		FROM audio_files
		WHERE unavailable_at IS NOT NULL AND deleted = 0
		GROUP BY 1
		ORDER BY 1
	`)).WillReturnRows(sqlmock.NewRows([]string{"day", "count"}))

	stats, err := service.GetUnavailableStats()
	if err != nil {
		t.Fatalf("GetUnavailableStats: %v", err)
	}
	if stats.Days == nil || len(stats.Days) != 0 {
		t.Fatalf("days = %#v, want an empty non-nil slice", stats.Days)
	}
}
