package ctrl

// The chunked-upload and directory-pagination cases that used to live here
// moved to server/pkg/files/hardening_test.go when upstream split the
// monolithic ctrl/files.go into that package.

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	. "github.com/mickael-kerjean/filestash/server/common"
)

func TestSafeLocalRedirect(t *testing.T) {
	for _, raw := range []string{"https://attacker.example/", "//attacker.example/", "javascript:alert(1)", "/ok\r\nLocation: https://attacker.example"} {
		if got := safeLocalRedirect(raw); got != WithBase("/") {
			t.Fatalf("unsafe redirect %q accepted as %q", raw, got)
		}
	}
	if got := safeLocalRedirect("/files?path=%2Fdocs"); got != WithBase("/files")+"?path=%2Fdocs" {
		t.Fatalf("local redirect changed: %q", got)
	}
}

func TestMCPOAuthContinuationRejectsForgedCookie(t *testing.T) {
	InitSecretDerivate(strings.Repeat("k", 32))
	requestID := strings.Repeat("r", 48)
	value, next, err := NewMCPOAuthContinuation(requestID)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/login", nil)
	req.AddCookie(&http.Cookie{Name: MCPOAuthContinuationCookie, Value: value})
	if got := mcpOAuthContinuation(req); got != next {
		t.Fatalf("bound continuation changed: got=%q want=%q", got, next)
	}
	req = httptest.NewRequest(http.MethodGet, "/login", nil)
	req.AddCookie(&http.Cookie{Name: MCPOAuthContinuationCookie, Value: value + "tampered"})
	if got := mcpOAuthContinuation(req); got != "" {
		t.Fatalf("forged continuation accepted: %q", got)
	}
}
