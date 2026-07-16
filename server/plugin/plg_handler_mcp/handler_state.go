package plg_handler_mcp

import (
	"net/http"
	"strings"
	"time"

	. "github.com/mickael-kerjean/filestash/server/plugin/plg_handler_mcp/types"
)

func (this *Server) RemoveSession(userSession *UserSession) {
	this.sessions.Delete(userSession.Id)
}

func ExtractToken(r *http.Request) string {
	authHeader := r.Header.Get("Authorization")
	if hasToken := strings.HasPrefix(authHeader, "Bearer "); hasToken == false {
		return ""
	}
	return strings.TrimPrefix(authHeader, "Bearer ")
}

func (this *Server) CreateSession(uuid string, token string) (*UserSession, bool) {
	count := 0
	this.sessions.Range(func(_, _ any) bool {
		count++
		return count < 128
	})
	if count >= 128 {
		return nil, false
	}
	session := &UserSession{
		Id:      uuid,
		Token:   token,
		Chan:    make(chan JSONRPCRequest, 16),
		CurrDir: "/",
		HomeDir: "/",
		Ping: Ping{
			ID:           0,
			LastResponse: time.Now(),
		},
	}
	actual, loaded := this.sessions.LoadOrStore(uuid, session)
	return actual.(*UserSession), !loaded
}

func (this *Server) GetSession(uuid string) (*UserSession, bool) {
	value, ok := this.sessions.Load(uuid)
	if !ok {
		return nil, false
	}
	return value.(*UserSession), true
}
