package services

import (
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestSearchExcludesRemovalRequestsBeforePagination(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	mock.ExpectQuery("removal_requested_at IS NULL").
		WithArgs("%track%", "%track%", "%track%", "%track%", "%track%", "%track%", 50, 0).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	service := &SearchService{db: &Database{db: db}}
	results, total, err := service.Search("track", 50, 0, SearchOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 0 || total != 0 {
		t.Fatalf("results = %#v, total = %d", results, total)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestRandomAudioUsesRemovalVisibilityFlag(t *testing.T) {
	for _, test := range []struct {
		name                    string
		includeRemovalRequested bool
		shareKey                string
	}{
		{name: "public", includeRemovalRequested: false, shareKey: "public-key"},
		{name: "local", includeRemovalRequested: true, shareKey: "local-key"},
	} {
		t.Run(test.name, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()

			mock.ExpectQuery(regexp.QuoteMeta("AND ($1 OR removal_requested_at IS NULL)")).
				WithArgs(test.includeRemovalRequested).
				WillReturnRows(sqlmock.NewRows([]string{"share_key"}).AddRow(test.shareKey))

			service := &SearchService{db: &Database{db: db}}
			shareKey, err := service.RandomAudio(test.includeRemovalRequested)
			if err != nil {
				t.Fatal(err)
			}
			if shareKey != test.shareKey {
				t.Fatalf("shareKey = %q, want %q", shareKey, test.shareKey)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestPlaybackDiscoveryRemovalFilter(t *testing.T) {
	if got := removalDiscoveryFilter(false); got != " AND af.removal_requested_at IS NULL" {
		t.Fatalf("public filter = %q", got)
	}
	if got := removalDiscoveryFilter(true); got != "" {
		t.Fatalf("local filter = %q, want empty", got)
	}
}

func TestPlaybackDiscoveryQueriesExcludeRemovalRequests(t *testing.T) {
	tests := []struct {
		name  string
		calls int
		run   func(*PlaybackService) error
	}{
		{
			name:  "recommendations and random fill",
			calls: 2,
			run: func(service *PlaybackService) error {
				_, err := service.GetRecommendations("track-key", 1, false)
				return err
			},
		},
		{
			name:  "recently played",
			calls: 1,
			run: func(service *PlaybackService) error {
				_, err := service.GetRecentlyPlayed(1, false)
				return err
			},
		},
		{
			name:  "popular",
			calls: 1,
			run: func(service *PlaybackService) error {
				_, err := service.GetPopularTracks(1, false)
				return err
			},
		},
		{
			name:  "recently added",
			calls: 1,
			run: func(service *PlaybackService) error {
				_, err := service.GetRecentlyAdded(1, false)
				return err
			},
		},
		{
			name:  "recently unavailable",
			calls: 1,
			run: func(service *PlaybackService) error {
				_, err := service.GetRecentlyUnavailable(1, false)
				return err
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()

			for i := 0; i < test.calls; i++ {
				expectation := mock.ExpectQuery("af.removal_requested_at IS NULL")
				if test.name == "recommendations and random fill" {
					expectation.WithArgs("track-key", 1)
				} else {
					expectation.WithArgs(1)
				}
				expectation.WillReturnRows(sqlmock.NewRows([]string{"unused"}))
			}

			service := &PlaybackService{db: &Database{db: db}}
			if err := test.run(service); err != nil {
				t.Fatal(err)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestLocalPlaybackDiscoveryIncludesRemovalState(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	requestedAt := time.Date(2026, time.August, 14, 18, 0, 0, 0, time.UTC)
	mock.ExpectQuery("SELECT").
		WithArgs(1).
		WillReturnRows(sqlmock.NewRows([]string{
			"share_key", "path", "filename", "title", "meta_artist", "parent_path",
			"folder_name", "folder_share_key", "thumbnail", "poster_image", "age_limit",
			"removal_requested_at",
		}).AddRow(
			"track-key", "Audio/track.mp3", "track.mp3", "Track", "Artist", "Audio",
			"Audio", "folder-key", nil, nil, 0, requestedAt,
		))

	service := &PlaybackService{db: &Database{db: db}}
	tracks, err := service.GetRecentlyAdded(1, true)
	if err != nil {
		t.Fatal(err)
	}
	if len(tracks) != 1 || tracks[0].RemovalRequestedAt == nil || !tracks[0].RemovalRequestedAt.Equal(requestedAt) {
		t.Fatalf("unexpected tracks: %#v", tracks)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
