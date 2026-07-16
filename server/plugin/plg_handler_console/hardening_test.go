//go:build linux

package plg_handler_console

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSameConsoleOrigin(t *testing.T) {
	for _, tc := range []struct {
		origin string
		want   bool
	}{
		{"https://files.example", true},
		{"http://files.example", true},
		{"https://attacker.example", false},
		{"", false},
	} {
		req := httptest.NewRequest(http.MethodGet, "https://files.example/admin/tty/socket", nil)
		req.Host = "files.example"
		req.Header.Set("Origin", tc.origin)
		if got := sameConsoleOrigin(req); got != tc.want {
			t.Fatalf("origin %q: got %v want %v", tc.origin, got, tc.want)
		}
	}
}
