package plg_handler_mcp

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	. "github.com/mickael-kerjean/filestash/server/common"
)

const (
	DEFAULT_TOKEN_EXPIRY  = 3600
	DEFAULT_SECRET_EXPIRY = 30 * 24 * 3600
)

type oauthClient struct {
	RedirectURIs map[string]struct{}
	ExpiresAt    time.Time
}

type oauthRequest struct {
	ClientID      string
	RedirectURI   string
	State         string
	CodeChallenge string
	ExpiresAt     time.Time
}

type oauthCode struct {
	AccessToken   string
	ClientID      string
	RedirectURI   string
	CodeChallenge string
	ExpiresAt     time.Time
}

func (this *Server) WellKnownOAuthAuthorizationServerHandler(_ *App, w http.ResponseWriter, r *http.Request) {
	baseURL := this.baseURL(r)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"issuer":                   baseURL,
		"authorization_endpoint":   fmt.Sprintf("%s/mcp/authorize", baseURL),
		"token_endpoint":           fmt.Sprintf("%s/mcp/token", baseURL),
		"registration_endpoint":    fmt.Sprintf("%s/mcp/register", baseURL),
		"response_types_supported": []string{"code"},
		"grant_types_supported":    []string{"authorization_code"},
		"token_endpoint_auth_methods_supported": []string{
			"none",
		},
		"code_challenge_methods_supported": []string{
			"S256",
		},
	})
}

func (this *Server) WellKnownOAuthProtectedResourceHandler(_ *App, w http.ResponseWriter, r *http.Request) {
	baseURL := this.baseURL(r)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"resource":                 baseURL,
		"authorization_servers":    []string{baseURL},
		"bearer_methods_supported": []string{"header"},
		"scopes_supported":         []string{"openid"},
	})
}

func (this *Server) baseURL(r *http.Request) string {
	scheme := "https"
	host := r.Host
	if strings.HasPrefix(host, "localhost") || strings.HasPrefix(host, "127.0.0.1") {
		scheme = "http"
	}
	return fmt.Sprintf("%s://%s", scheme, host)
}

func (this *Server) AuthorizeHandler(ctx *App, w http.ResponseWriter, r *http.Request) {
	responseType := r.URL.Query().Get("response_type")
	clientID := r.URL.Query().Get("client_id")
	redirectURI := r.URL.Query().Get("redirect_uri")
	state := r.URL.Query().Get("state")
	codeChallenge := r.URL.Query().Get("code_challenge")
	codeChallengeMethod := r.URL.Query().Get("code_challenge_method")

	if responseType != "code" {
		http.Error(w, "response_type must be 'code'", http.StatusBadRequest)
		return
	} else if clientID == "" {
		http.Error(w, "client_id is required", http.StatusBadRequest)
		return
	} else if redirectURI == "" {
		http.Error(w, "redirect_uri is required", http.StatusBadRequest)
		return
	} else if codeChallengeMethod != "S256" || len(codeChallenge) < 43 || len(codeChallenge) > 128 {
		http.Error(w, "S256 PKCE is required", http.StatusBadRequest)
		return
	}
	clientValue, ok := this.clients.Load(clientID)
	if !ok {
		http.Error(w, "unknown client_id", http.StatusBadRequest)
		return
	}
	client := clientValue.(oauthClient)
	if time.Now().After(client.ExpiresAt) {
		this.clients.Delete(clientID)
		http.Error(w, "expired client_id", http.StatusBadRequest)
		return
	}
	if _, ok := client.RedirectURIs[redirectURI]; !ok {
		http.Error(w, "redirect_uri does not match registration", http.StatusBadRequest)
		return
	}
	requestID := RandomString(48)
	this.requests.Store(requestID, oauthRequest{
		ClientID: clientID, RedirectURI: redirectURI, State: state,
		CodeChallenge: codeChallenge, ExpiresAt: time.Now().Add(5 * time.Minute),
	})
	cookieValue, next, err := NewMCPOAuthContinuation(requestID)
	if err != nil {
		this.requests.Delete(requestID)
		http.Error(w, "could not create authorization request", http.StatusInternalServerError)
		return
	}
	setOAuthContinuationCookie(w, r, cookieValue, 5*time.Minute)
	if ctx != nil && ctx.Backend != nil && ctx.Authorization != "" {
		http.Redirect(w, r, next, http.StatusSeeOther)
		return
	}
	http.Redirect(w, r, WithBase("/login")+"?"+url.Values{"next": []string{next}}.Encode(), http.StatusSeeOther)
}

func (this *Server) TokenHandler(_ *App, w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	if err := r.ParseForm(); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	if grantType := r.FormValue("grant_type"); grantType != "authorization_code" {
		http.Error(w, "Invalid Grant Type", http.StatusBadRequest)
		return
	}
	codeValue, ok := this.codes.LoadAndDelete(r.FormValue("code"))
	if !ok {
		http.Error(w, "Invalid authorization code", http.StatusBadRequest)
		return
	}
	code := codeValue.(oauthCode)
	verifier := r.FormValue("code_verifier")
	digest := sha256.Sum256([]byte(verifier))
	actualChallenge := base64.RawURLEncoding.EncodeToString(digest[:])
	if time.Now().After(code.ExpiresAt) || code.ClientID != r.FormValue("client_id") ||
		code.RedirectURI != r.FormValue("redirect_uri") || len(verifier) < 43 ||
		len(actualChallenge) != len(code.CodeChallenge) || subtle.ConstantTimeCompare([]byte(actualChallenge), []byte(code.CodeChallenge)) != 1 {
		http.Error(w, "Invalid authorization code binding", http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"access_token": code.AccessToken,
		"token_type":   "Bearer",
		"expires_in":   DEFAULT_TOKEN_EXPIRY,
	})
}

func (this *Server) RegisterHandler(ctx *App, w http.ResponseWriter, r *http.Request) {
	clientName := regexp.MustCompile("[^a-zA-Z0-9\\-]+").ReplaceAllString(
		fmt.Sprintf("%s", ctx.Body["client_name"]),
		"",
	)
	if clientName == "" {
		http.Error(w, "client_name is required", http.StatusBadRequest)
		return
	}
	redirectValues, ok := ctx.Body["redirect_uris"].([]interface{})
	if !ok || len(redirectValues) == 0 || len(redirectValues) > 10 {
		http.Error(w, "redirect_uris must contain between 1 and 10 entries", http.StatusBadRequest)
		return
	}
	redirectURIs := make([]string, 0, len(redirectValues))
	registered := make(map[string]struct{}, len(redirectValues))
	for _, raw := range redirectValues {
		redirectURI, ok := raw.(string)
		if !ok || !validOAuthRedirectURI(redirectURI) {
			http.Error(w, "invalid redirect_uri", http.StatusBadRequest)
			return
		}
		redirectURIs = append(redirectURIs, redirectURI)
		registered[redirectURI] = struct{}{}
	}
	clientID := clientName + "." + RandomString(24)
	expiresAt := time.Now().Add(DEFAULT_SECRET_EXPIRY * time.Second)
	this.clients.Store(clientID, oauthClient{RedirectURIs: registered, ExpiresAt: expiresAt})
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(struct {
		ClientID                string   `json:"client_id"`
		ClientSecret            string   `json:"client_secret"`
		ClientIDIssuedAt        int64    `json:"client_id_issued_at"`
		ClientSecretExpiresAt   int64    `json:"client_secret_expires_at"`
		ClientName              string   `json:"client_name"`
		RedirectURIs            []string `json:"redirect_uris"`
		GrantTypes              []string `json:"grant_types"`
		TokenEndpointAuthMethod string   `json:"token_endpoint_auth_method"`
	}{
		ClientID:                clientID,
		ClientSecret:            "",
		ClientIDIssuedAt:        time.Now().Unix(),
		ClientSecretExpiresAt:   expiresAt.Unix(),
		ClientName:              clientName,
		RedirectURIs:            redirectURIs,
		GrantTypes:              []string{"authorization_code"},
		TokenEndpointAuthMethod: "none",
	})
}

func (this *Server) CallbackHandler(ctx *App, res http.ResponseWriter, req *http.Request) {
	requestID := req.URL.Query().Get("request_id")
	cookie, err := req.Cookie(MCPOAuthContinuationCookie)
	if err != nil {
		SendErrorResult(res, ErrNotValid)
		return
	}
	boundRequestID, callback, err := ParseMCPOAuthContinuation(cookie.Value)
	if err != nil || boundRequestID != requestID || req.URL.RequestURI() != callback {
		SendErrorResult(res, ErrNotValid)
		return
	}
	requestValue, ok := this.requests.LoadAndDelete(requestID)
	if !ok {
		SendErrorResult(res, ErrNotValid)
		return
	}
	setOAuthContinuationCookie(res, req, "", -time.Hour)
	authRequest := requestValue.(oauthRequest)
	if time.Now().After(authRequest.ExpiresAt) {
		SendErrorResult(res, ErrNotValid)
		return
	}
	code := RandomString(48)
	this.codes.Store(code, oauthCode{
		AccessToken: ctx.Authorization, ClientID: authRequest.ClientID,
		RedirectURI: authRequest.RedirectURI, CodeChallenge: authRequest.CodeChallenge,
		ExpiresAt: time.Now().Add(2 * time.Minute),
	})
	redirect, _ := url.Parse(authRequest.RedirectURI)
	query := redirect.Query()
	query.Set("code", code)
	if authRequest.State != "" {
		query.Set("state", authRequest.State)
	}
	redirect.RawQuery = query.Encode()
	http.Redirect(res, req, redirect.String(), http.StatusSeeOther)
}

func setOAuthContinuationCookie(res http.ResponseWriter, req *http.Request, value string, lifetime time.Duration) {
	maxAge := int(lifetime.Seconds())
	if lifetime < 0 {
		maxAge = -1
	}
	http.SetCookie(res, &http.Cookie{
		Name:     MCPOAuthContinuationCookie,
		Value:    value,
		Path:     WithBase("/"),
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   req.TLS != nil || strings.EqualFold(req.Header.Get("X-Forwarded-Proto"), "https"),
		SameSite: http.SameSiteLaxMode,
	})
}

func validOAuthRedirectURI(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil || !u.IsAbs() || u.Host == "" || u.Fragment != "" || u.User != nil {
		return false
	}
	if u.Scheme == "https" {
		return true
	}
	if u.Scheme != "http" {
		return false
	}
	host := u.Hostname()
	return host == "localhost" || strings.HasPrefix(host, "127.") || host == "::1"
}
