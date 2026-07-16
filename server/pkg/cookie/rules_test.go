package cookie

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWithRulesTrustsForwardedHTTPS(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "http://filestash.internal/", nil)
	req.Header.Set("X-Forwarded-Proto", "https")

	got := Create(&http.Cookie{Name: "session", Value: "value"}, WithRules(req))
	if !got.HttpOnly || !got.Secure || got.SameSite != http.SameSiteStrictMode {
		t.Fatalf("unexpected hardened cookie: %#v", got)
	}
}
