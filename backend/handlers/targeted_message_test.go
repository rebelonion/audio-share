package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestAdminCreatesTargetedMessage(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	createdAt := time.Date(2026, time.July, 31, 12, 0, 0, 0, time.UTC)
	mock.ExpectQuery("INSERT INTO targeted_messages").
		WithArgs("session-123", defaultTargetedMessageTitle, "Please get in touch.").
		WillReturnRows(sqlmock.NewRows(
			[]string{"id", "session_id", "title", "message", "created_at"},
		).AddRow(42, "session-123", defaultTargetedMessageTitle, "Please get in touch.", createdAt))

	handler := NewAdminHandler(db, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"https://example.test/api/admin/targeted-messages",
		strings.NewReader(`{"sessionId":" session-123 ","message":" Please get in touch. "}`),
	)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusCreated {
		t.Fatalf("status = %d, body=%s", recorder.Code, recorder.Body.String())
	}
	var response targetedMessage
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatal(err)
	}
	if response.ID != 42 || response.SessionID != "session-123" || response.Title != defaultTargetedMessageTitle {
		t.Fatalf("response = %#v", response)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestAdminRejectsSecondPendingTargetedMessage(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	mock.ExpectQuery("INSERT INTO targeted_messages").
		WithArgs("session-123", "Notice", "One at a time.").
		WillReturnRows(sqlmock.NewRows(
			[]string{"id", "session_id", "title", "message", "created_at"},
		))

	handler := NewAdminHandler(db, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"https://example.test/api/admin/targeted-messages",
		strings.NewReader(`{"sessionId":"session-123","title":"Notice","message":"One at a time."}`),
	)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusConflict {
		t.Fatalf("status = %d, body=%s", recorder.Code, recorder.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestAdminValidatesTargetedMessage(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	handler := NewAdminHandler(db, nil)
	for name, body := range map[string]string{
		"missing session":  `{"message":"Hello"}`,
		"missing message":  `{"sessionId":"session-123"}`,
		"title too long":   `{"sessionId":"session-123","title":"` + strings.Repeat("x", maxTargetedMessageTitle+1) + `","message":"Hello"}`,
		"message too long": `{"sessionId":"session-123","message":"` + strings.Repeat("x", maxTargetedMessageLength+1) + `"}`,
	} {
		t.Run(name, func(t *testing.T) {
			request := httptest.NewRequest(
				http.MethodPost,
				"https://example.test/api/admin/targeted-messages",
				strings.NewReader(body),
			)
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, request)
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, body=%s", recorder.Code, recorder.Body.String())
			}
		})
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestTargetedMessageIsConsumedOnce(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	mock.ExpectQuery("DELETE FROM targeted_messages").
		WithArgs("session-123").
		WillReturnRows(sqlmock.NewRows(
			[]string{"id", "title", "message"},
		).AddRow(42, "A direct note", "Please get in touch."))
	mock.ExpectQuery("DELETE FROM targeted_messages").
		WithArgs("session-123").
		WillReturnRows(sqlmock.NewRows([]string{"id", "title", "message"}))

	secret := "test-secret"
	handler := NewTargetedMessageHandler(db, secret)
	request := targetedMessageRequest(secret, "session-123")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("first status = %d, body=%s", recorder.Code, recorder.Body.String())
	}
	var response targetedMessage
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatal(err)
	}
	if response.ID != 42 || response.Title != "A direct note" || response.Message != "Please get in touch." {
		t.Fatalf("response = %#v", response)
	}

	request = targetedMessageRequest(secret, "session-123")
	recorder = httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusNoContent {
		t.Fatalf("second status = %d, body=%s", recorder.Code, recorder.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestTargetedMessageCreatesSessionWhenCookieIsMissing(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	handler := NewTargetedMessageHandler(db, "test-secret")
	request := httptest.NewRequest(http.MethodPost, "https://example.test/api/session/targeted-message", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("status = %d, body=%s", recorder.Code, recorder.Body.String())
	}
	if len(recorder.Result().Cookies()) != 2 {
		t.Fatalf("set %d cookies, want 2", len(recorder.Result().Cookies()))
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestTargetedMessageRejectsOtherMethods(t *testing.T) {
	handler := NewTargetedMessageHandler(nil, "test-secret")
	request := httptest.NewRequest(http.MethodGet, "https://example.test/api/session/targeted-message", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", recorder.Code)
	}
}

func targetedMessageRequest(secret, sessionID string) *http.Request {
	request := httptest.NewRequest(http.MethodPost, "https://example.test/api/session/targeted-message", nil)
	request.AddCookie(&http.Cookie{
		Name:  sessionCookieName,
		Value: signValue(sessionID, []byte(secret)),
	})
	return request
}
