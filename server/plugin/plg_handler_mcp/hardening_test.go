package plg_handler_mcp

import (
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	. "github.com/mickael-kerjean/filestash/server/common"
	. "github.com/mickael-kerjean/filestash/server/plugin/plg_handler_mcp/impl"
	. "github.com/mickael-kerjean/filestash/server/plugin/plg_handler_mcp/types"
)

func TestOAuthCodeIsPKCEBoundAndOneUse(t *testing.T) {
	InitSecretDerivate(strings.Repeat("k", 32))
	server := &Server{}
	verifier := strings.Repeat("v", 48)
	digest := sha256.Sum256([]byte(verifier))
	challenge := base64.RawURLEncoding.EncodeToString(digest[:])
	requestID := strings.Repeat("r", 48)
	server.requests.Store(requestID, oauthRequest{
		ClientID: "client", RedirectURI: "https://client.example/callback", State: "caller-state",
		CodeChallenge: challenge, ExpiresAt: time.Now().Add(time.Minute),
	})

	cookieValue, _, err := NewMCPOAuthContinuation(requestID)
	if err != nil {
		t.Fatal(err)
	}
	callbackReq := httptest.NewRequest(http.MethodGet, "/api/mcp?request_id="+requestID, nil)
	callbackReq.AddCookie(&http.Cookie{Name: MCPOAuthContinuationCookie, Value: cookieValue})
	callbackRes := httptest.NewRecorder()
	server.CallbackHandler(&App{Authorization: "bound-access-token"}, callbackRes, callbackReq)
	location, err := url.Parse(callbackRes.Header().Get("Location"))
	if err != nil || location.Query().Get("state") != "caller-state" {
		t.Fatalf("invalid callback location %q: %v", callbackRes.Header().Get("Location"), err)
	}
	code := location.Query().Get("code")
	if code == "" || code == "bound-access-token" {
		t.Fatalf("authorization code is not opaque: %q", code)
	}

	form := url.Values{"grant_type": {"authorization_code"}, "code": {code}, "client_id": {"client"}, "redirect_uri": {"https://client.example/callback"}, "code_verifier": {verifier}}
	requestToken := func() *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/mcp/token", strings.NewReader(form.Encode()))
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		res := httptest.NewRecorder()
		server.TokenHandler(&App{}, res, req)
		return res
	}
	if res := requestToken(); res.Code != http.StatusOK || !strings.Contains(res.Body.String(), "bound-access-token") {
		t.Fatalf("token exchange failed: status=%d body=%s", res.Code, res.Body.String())
	}
	if res := requestToken(); res.Code != http.StatusBadRequest {
		t.Fatalf("replayed code status=%d", res.Code)
	}
}

func TestOAuthCallbackRequiresBoundContinuation(t *testing.T) {
	InitSecretDerivate(strings.Repeat("k", 32))
	server := &Server{}
	requestID := strings.Repeat("b", 48)
	server.requests.Store(requestID, oauthRequest{ExpiresAt: time.Now().Add(time.Minute)})
	req := httptest.NewRequest(http.MethodGet, "/api/mcp?request_id="+requestID, nil)
	res := httptest.NewRecorder()
	server.CallbackHandler(&App{Authorization: "token"}, res, req)
	if res.Code != ErrNotValid.Status() {
		t.Fatalf("unbound callback status=%d body=%s", res.Code, res.Body.String())
	}
	if _, ok := server.requests.Load(requestID); !ok {
		t.Fatal("unbound request consumed the authorization request")
	}
}

func TestResourceReadEmitsExactlyOneJSONRPCResponse(t *testing.T) {
	uri := "filestash://regression/single-response"
	RegisterResource(Resource{URI: uri, MimeType: "text/plain", Content: "content"})
	for _, request := range []JSONRPCRequest{
		{ID: 1, Params: map[string]any{"uri": uri}},
		{ID: 2, Params: map[string]any{"uri": "filestash://missing"}},
		{ID: 3, Params: map[string]any{}},
	} {
		res := httptest.NewRecorder()
		respondResourceRead(res, request)
		if count := strings.Count(res.Body.String(), "event: message\n"); count != 1 {
			t.Fatalf("request %d emitted %d responses: %q", request.ID, count, res.Body.String())
		}
	}
}

func TestOAuthRedirectValidation(t *testing.T) {
	for _, raw := range []string{"https://client.example/callback", "http://localhost/callback", "http://127.0.0.1:3000/callback"} {
		if !validOAuthRedirectURI(raw) {
			t.Fatalf("valid redirect rejected: %s", raw)
		}
	}
	for _, raw := range []string{"http://attacker.example/callback", "javascript:alert(1)", "//attacker.example/callback", "https://user@client.example/callback"} {
		if validOAuthRedirectURI(raw) {
			t.Fatalf("unsafe redirect accepted: %s", raw)
		}
	}
}

func TestAuthorizeBindsOnlyInternalLoginContinuation(t *testing.T) {
	InitSecretDerivate(strings.Repeat("k", 32))
	server := &Server{}
	redirectURI := "https://client.example/callback"
	server.clients.Store("client", oauthClient{
		RedirectURIs: map[string]struct{}{redirectURI: {}},
		ExpiresAt:    time.Now().Add(time.Minute),
	})
	query := url.Values{
		"response_type":         {"code"},
		"client_id":             {"client"},
		"redirect_uri":          {redirectURI},
		"state":                 {"client-state"},
		"code_challenge":        {strings.Repeat("c", 43)},
		"code_challenge_method": {"S256"},
	}
	req := httptest.NewRequest(http.MethodGet, "/mcp/authorize?"+query.Encode(), nil)
	res := httptest.NewRecorder()
	server.AuthorizeHandler(&App{}, res, req)
	if res.Code != http.StatusSeeOther {
		t.Fatalf("authorize status=%d body=%s", res.Code, res.Body.String())
	}
	login, err := url.Parse(res.Header().Get("Location"))
	if err != nil || login.Path != WithBase("/login") {
		t.Fatalf("invalid login redirect %q: %v", res.Header().Get("Location"), err)
	}
	cookies := res.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != MCPOAuthContinuationCookie || !cookies[0].HttpOnly {
		t.Fatalf("authorization continuation was not bound in an HttpOnly cookie: %#v", cookies)
	}
	_, callback, err := ParseMCPOAuthContinuation(cookies[0].Value)
	if err != nil || login.Query().Get("next") != callback || !strings.HasPrefix(callback, WithBase("/api/mcp?request_id=")) {
		t.Fatalf("unsafe or lost callback: next=%q callback=%q err=%v", login.Query().Get("next"), callback, err)
	}
}

func TestMessageHandlerRejectsUnknownAndMismatchedSessions(t *testing.T) {
	server := &Server{}
	request := func(sessionID, token string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/messages?sessionId="+sessionID, strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"ping"}`))
		req.Header.Set("Authorization", "Bearer "+token)
		res := httptest.NewRecorder()
		server.messageHandler(&App{}, res, req)
		return res
	}
	if res := request("missing", "token"); res.Code != http.StatusNotFound {
		t.Fatalf("unknown session status=%d", res.Code)
	}
	server.sessions.Store("known", &UserSession{Id: "known", Token: "correct", Chan: make(chan JSONRPCRequest, 1)})
	if res := request("known", "wrong"); res.Code != http.StatusUnauthorized {
		t.Fatalf("mismatched session status=%d", res.Code)
	}
	if res := request("known", "correct"); res.Code != http.StatusNoContent {
		t.Fatalf("bound session status=%d body=%s", res.Code, res.Body.String())
	}
}
