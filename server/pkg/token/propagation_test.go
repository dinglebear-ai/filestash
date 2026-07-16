package token

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestInjectAndExtractLargeToken(t *testing.T) {
	value := strings.Repeat("session", 1500)
	req := httptest.NewRequest(http.MethodGet, "https://filestash.example/", nil)
	res := httptest.NewRecorder()

	Inject(res, req, value)
	cookies := res.Result().Cookies()
	if len(cookies) < 2 {
		t.Fatalf("expected split session cookies, got %d", len(cookies))
	}

	extractReq := httptest.NewRequest(http.MethodGet, "https://filestash.example/", nil)
	for _, sessionCookie := range cookies {
		extractReq.AddCookie(sessionCookie)
	}
	if got := Extract(extractReq); got != value {
		t.Fatalf("reassembled token differs: got %d bytes, want %d", len(got), len(value))
	}
}

func TestExtractRejectsQueryTokenAndAcceptsBasicAuth(t *testing.T) {
	queryReq := httptest.NewRequest(http.MethodGet, "https://filestash.example/?authorization=leaked", nil)
	if got := Extract(queryReq); got != "" {
		t.Fatalf("query parameter must not authenticate a request, got %q", got)
	}

	basicReq := httptest.NewRequest(http.MethodGet, "https://filestash.example/", nil)
	basicReq.SetBasicAuth("authorization", "secret")
	if got := Extract(basicReq); got != "secret" {
		t.Fatalf("basic authorization token = %q, want secret", got)
	}
}
