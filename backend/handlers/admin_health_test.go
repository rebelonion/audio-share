package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/onion/audio-share-backend/middleware"
)

func TestLibraryHealthRequiresAdminKeyAndNeverCaches(t *testing.T) {
	for _, configured := range []string{"", "admin-test-key"} {
		for _, provided := range []string{"", "incorrect"} {
			handler := middleware.NewAPIKeyAuth(configured).Middleware(NewAdminHandler(nil, nil))
			request := httptest.NewRequest(http.MethodGet, "/api/admin/health", nil)
			request.Header.Set("X-API-Key", provided)
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusUnauthorized || response.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("status=%d headers=%v", response.Code, response.Header())
			}
		}
	}
}

func TestLibraryHealthDatabaseFailureIsGeneric(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	mock.ExpectQuery("SELECT").WillReturnError(http.ErrHandlerTimeout)
	handler := middleware.NewAPIKeyAuth("admin-test-key").Middleware(NewAdminHandler(db, nil))
	request := httptest.NewRequest(http.MethodGet, "/api/admin/health", nil)
	request.Header.Set("X-API-Key", "admin-test-key")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusInternalServerError || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("status=%d", response.Code)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
