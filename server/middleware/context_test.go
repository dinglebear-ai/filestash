package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	. "github.com/mickael-kerjean/filestash/server/common"
)

func TestBodyParserWithLimitRejectsOversizeAndTrailingJSON(t *testing.T) {
	called := false
	handler := BodyParserWithLimit(16)(func(_ *App, w http.ResponseWriter, _ *http.Request) {
		called = true
		w.WriteHeader(http.StatusNoContent)
	})

	for name, body := range map[string]string{
		"oversize": `{"payload":"this is larger than the limit"}`,
		"trailing": `{} {}`,
	} {
		t.Run(name, func(t *testing.T) {
			called = false
			req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
			res := httptest.NewRecorder()
			handler(&App{}, res, req)
			if res.Code < 400 || called {
				t.Fatalf("status=%d called=%v", res.Code, called)
			}
		})
	}
}

func TestAdminOnlyRequiresFirstRunSetupBoundary(t *testing.T) {
	t.Setenv("FILESTASH_SETUP_TOKEN", strings.Repeat("s", 32))

	handler := AdminOnly(func(_ *App, w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	for _, tc := range []struct {
		path, token string
		want        int
	}{
		{"/admin/api/config", strings.Repeat("s", 32), http.StatusNoContent},
		{"/admin/api/config", "", http.StatusForbidden},
		{"/admin/api/workflow", strings.Repeat("s", 32), http.StatusForbidden},
	} {
		req := httptest.NewRequest(http.MethodGet, tc.path, nil)
		req.Header.Set("X-Filestash-Setup-Token", tc.token)
		res := httptest.NewRecorder()
		handler(&App{}, res, req)
		if res.Code != tc.want {
			t.Fatalf("%s: got %d want %d", tc.path, res.Code, tc.want)
		}
	}
}
