package services

import (
	"errors"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestRecommendationsPropagatesRowError(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	want := errors.New("connection lost while reading recommendations")
	mock.ExpectQuery("WITH normalized_events").WithArgs("target", 30).
		WillReturnRows(sqlmock.NewRows([]string{"share_key"}).AddRow("candidate").RowError(0, want))
	service := NewPlaybackService(&Database{db: db}, time.Hour)
	if _, err := service.GetRecommendations("target", 30, false); !errors.Is(err, want) {
		t.Fatalf("got %v, want underlying row error %v", err, want)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
