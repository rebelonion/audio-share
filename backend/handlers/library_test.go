package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/onion/audio-share-backend/services"
)

type fakeLibraryService struct {
	ensureProfile         func(string) error
	rotateRecoveryKey     func(string) (string, error)
	recoverProfile        func(string) (string, error)
	likedTrackKeys        func(string) ([]string, error)
	likedTracks           func(string) ([]services.LibraryTrack, error)
	profileHasRecoveryKey func(string) (bool, error)
	like                  func(string, string) error
	unlike                func(string, string) error
}

func (f fakeLibraryService) EnsureProfile(sessionID string) error {
	if f.ensureProfile == nil {
		return nil
	}
	return f.ensureProfile(sessionID)
}

func (f fakeLibraryService) RotateRecoveryKey(sessionID string) (string, error) {
	return f.rotateRecoveryKey(sessionID)
}

func (f fakeLibraryService) RecoverProfile(key string) (string, error) {
	return f.recoverProfile(key)
}

func (f fakeLibraryService) LikedTracks(sessionID string) ([]services.LibraryTrack, error) {
	return f.likedTracks(sessionID)
}

func (f fakeLibraryService) LikedTrackKeys(sessionID string) ([]string, error) {
	return f.likedTrackKeys(sessionID)
}

func (f fakeLibraryService) ProfileHasRecoveryKey(sessionID string) (bool, error) {
	return f.profileHasRecoveryKey(sessionID)
}

func (f fakeLibraryService) Like(sessionID, shareKey string) error {
	return f.like(sessionID, shareKey)
}

func (f fakeLibraryService) Unlike(sessionID, shareKey string) error {
	return f.unlike(sessionID, shareKey)
}

func TestPreventProfileCaching(t *testing.T) {
	recorder := httptest.NewRecorder()

	preventProfileCaching(recorder)

	if got := recorder.Header().Get("Cache-Control"); got != "private, no-store" {
		t.Fatalf("Cache-Control = %q, want private, no-store", got)
	}
	if got := recorder.Header().Get("Pragma"); got != "no-cache" {
		t.Fatalf("Pragma = %q, want no-cache", got)
	}
}

func TestRecoverHandlerReturnsRecoveredProfile(t *testing.T) {
	const profileID = "recovered-profile"
	handler := &LibraryHandler{
		sessionSecret: []byte("test-secret"),
		library: fakeLibraryService{
			recoverProfile: func(key string) (string, error) {
				if key != "asr_test-key" {
					t.Fatalf("recovery key = %q, want trimmed key", key)
				}
				return profileID, nil
			},
		},
	}
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/profile/recover",
		strings.NewReader(`{"recoveryKey":"  asr_test-key  "}`),
	)
	recorder := httptest.NewRecorder()

	handler.RecoverHandler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body = %q", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	var response recoverProfileResponse
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.ProfileID != profileID {
		t.Fatalf("profileId = %q, want %q", response.ProfileID, profileID)
	}

	cookies := recorder.Result().Cookies()
	var sessionSet, matureCleared bool
	for _, cookie := range cookies {
		switch cookie.Name {
		case sessionCookieName:
			sessionSet = cookie.Value != ""
		case matureCookieName:
			matureCleared = cookie.MaxAge < 0
		}
	}
	if !sessionSet {
		t.Fatal("session cookie was not set")
	}
	if !matureCleared {
		t.Fatal("mature preference cookie was not cleared")
	}
}

func TestRecoverHandlerRejectsInvalidKey(t *testing.T) {
	handler := NewLibraryHandler(fakeLibraryService{
		recoverProfile: func(string) (string, error) {
			return "", services.ErrInvalidRecoveryKey
		},
	}, "test-secret")
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/profile/recover",
		strings.NewReader(`{"recoveryKey":"asr_invalid"}`),
	)
	recorder := httptest.NewRecorder()

	handler.RecoverHandler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusUnauthorized)
	}
}

func TestLikeItemHandlerUsesResolvedProfile(t *testing.T) {
	var gotSessionID, gotShareKey string
	handler := NewLibraryHandler(fakeLibraryService{
		like: func(sessionID, shareKey string) error {
			gotSessionID = sessionID
			gotShareKey = shareKey
			return nil
		},
	}, "test-secret")
	request := httptest.NewRequest(http.MethodPut, "/api/likes/track-key", nil)
	recorder := httptest.NewRecorder()

	handler.LikeItemHandler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d; body = %q", recorder.Code, http.StatusNoContent, recorder.Body.String())
	}
	if gotSessionID == "" || gotShareKey != "track-key" {
		t.Fatalf("Like(%q, %q), want generated session and track-key", gotSessionID, gotShareKey)
	}
}

func TestLikeItemHandlerMapsMissingTrack(t *testing.T) {
	handler := NewLibraryHandler(fakeLibraryService{
		like: func(string, string) error {
			return services.ErrTrackNotFound
		},
	}, "test-secret")
	request := httptest.NewRequest(http.MethodPut, "/api/likes/missing", nil)
	recorder := httptest.NewRecorder()

	handler.LikeItemHandler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusNotFound)
	}
}

func TestLikesHandlerReturnsProfileState(t *testing.T) {
	handler := NewLibraryHandler(fakeLibraryService{
		likedTrackKeys: func(string) ([]string, error) {
			return []string{"track-key"}, nil
		},
		profileHasRecoveryKey: func(string) (bool, error) {
			return true, nil
		},
	}, "test-secret")
	request := httptest.NewRequest(http.MethodGet, "/api/likes", nil)
	recorder := httptest.NewRecorder()

	handler.LikesHandler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body = %q", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	var response likesResponse
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.ProfileID == "" ||
		!response.HasRecoveryKey ||
		len(response.ShareKeys) != 1 ||
		response.ShareKeys[0] != "track-key" {
		t.Fatalf("unexpected response: %#v", response)
	}
}

func TestLikedTracksHandlerReturnsDetailedTracks(t *testing.T) {
	title := "Liked track"
	handler := NewLibraryHandler(fakeLibraryService{
		likedTracks: func(string) ([]services.LibraryTrack, error) {
			return []services.LibraryTrack{{
				TrackSummary: services.TrackSummary{ShareKey: "track-key", Title: &title},
			}}, nil
		},
	}, "test-secret")
	request := httptest.NewRequest(http.MethodGet, "/api/likes/tracks", nil)
	recorder := httptest.NewRecorder()

	handler.LikedTracksHandler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body = %q", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	var response likedTracksResponse
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(response.Tracks) != 1 || response.Tracks[0].ShareKey != "track-key" {
		t.Fatalf("unexpected response: %#v", response)
	}
}

func TestLikesHandlerStopsWhenProfileInitializationFails(t *testing.T) {
	handler := NewLibraryHandler(fakeLibraryService{
		ensureProfile: func(string) error {
			return errors.New("database unavailable")
		},
	}, "test-secret")
	request := httptest.NewRequest(http.MethodGet, "/api/likes", nil)
	recorder := httptest.NewRecorder()

	handler.LikesHandler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusInternalServerError)
	}
}
