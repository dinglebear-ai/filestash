package plg_handler_mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	. "github.com/mickael-kerjean/filestash/server/common"
	"github.com/mickael-kerjean/filestash/server/model"
	. "github.com/mickael-kerjean/filestash/server/plugin/plg_handler_mcp/impl"
	. "github.com/mickael-kerjean/filestash/server/plugin/plg_handler_mcp/types"
	. "github.com/mickael-kerjean/filestash/server/plugin/plg_handler_mcp/utils"

	"github.com/google/uuid"
)

const SESSION_TIME = 60

func (this *Server) messageHandler(_ *App, w http.ResponseWriter, r *http.Request) {
	sessionID := r.URL.Query().Get("sessionId")
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte("Invalid Request"))
		return
	}
	userSession, ok := this.GetSession(sessionID)
	if !ok {
		http.Error(w, "Unknown session", http.StatusNotFound)
		return
	}
	if token := ExtractToken(r); token == "" || token != userSession.Token {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 256<<10)
	request := JSONRPCRequest{}
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte("ERR: " + err.Error()))
		return
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		http.Error(w, "Invalid trailing data", http.StatusBadRequest)
		return
	}
	select {
	case userSession.Chan <- request:
		w.WriteHeader(http.StatusNoContent)
	case <-r.Context().Done():
		http.Error(w, "Request cancelled", http.StatusRequestTimeout)
	default:
		http.Error(w, "Session queue full", http.StatusTooManyRequests)
	}
}

func (this *Server) sseHandler(_ *App, w http.ResponseWriter, r *http.Request) {
	token := ExtractToken(r)
	if token == "" {
		Log.Debug("plg_handler_mcp::sse msg=invalid_token")
		w.Header().Add("Content-Type", "application/json")
		w.Header().Add("WWW-Authenticate", "Bearer resource_metadata=\""+this.baseURL(r)+"/.well-known/oauth-protected-resource\"")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(JSONRPCResponse{
			JSONRPC: "2.0",
			Error: &JSONRPCError{
				Code:    http.StatusUnauthorized,
				Message: "Missing or invalid access token",
			},
		})
		return
	}

	if _, err := getBackend(token); err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	userSession, created := this.CreateSession(uuid.New().String(), token)
	if !created {
		http.Error(w, "Too many MCP sessions", http.StatusServiceUnavailable)
		return
	}
	if b, err := getBackend(userSession.Token); err == nil {
		userSession.HomeDir, _ = model.GetHome(b, "/")
		userSession.CurrDir = ToString(userSession.HomeDir, "/")
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	fmt.Fprintf(w, "event: endpoint\ndata: %s?sessionId=%s\n\n", "/messages", userSession.Id)
	w.(http.Flusher).Flush()

	for {
		select {
		case request := <-userSession.Chan:
			b, err := getBackend(userSession.Token)
			if err != nil {
				if err == ErrNotAuthorized {
					err = JSONRPCError{
						Code:    ErrNotAuthorized.Status(),
						Message: "You aren't authenticated",
					}
				}
				SendError(w, request.ID, err)
				break
			}
			userSession.Backend = b

			switch request.Method {
			case "initialize":
				SendMessage(w, request.ID, InitializeResponse{
					ProtocolVersion: "2024-11-05",
					ServerInfo: ServerInfo{
						Name:    "Universal Storage Server",
						Version: "1.0.0",
					},
					Capabilities: Capabilities{
						Tools:     map[string]interface{}{},
						Resources: map[string]interface{}{},
						Prompts:   map[string]interface{}{},
					},
				})
			case "resources/list":
				SendMessage(w, request.ID, &ResourcesListResponse{
					Resources: AllResources(),
				})
			case "resources/templates/list":
				SendMessage(w, request.ID, &ResourceTemplatesListResponse{
					ResourceTemplates: AllResourceTemplates(),
				})
			case "resources/read":
				respondResourceRead(w, request)
			case "prompts/list":
				SendMessage(w, request.ID, &PromptsListResponse{
					Prompts: AllPrompts(),
				})
			case "prompts/get":
				if m, ok := request.Params["name"].(string); ok {
					res, err := ExecPromptGet(m, request.Params, userSession)
					if err == nil {
						SendMessage(w, request.ID, PromptGetResponse{
							Messages:    res,
							Description: ExecPromptDescription(request.Params),
						})
					} else {
						SendError(w, request.ID, err)
					}
				} else {
					SendError(w, request.ID, JSONRPCError{
						Code:    http.StatusBadRequest,
						Message: fmt.Sprintf("Unexpected parameters: %v", request.Params),
					})
				}
			case "tools/list":
				SendMessage(w, request.ID, &ListToolsResponse{
					Tools: AllTools(),
				})
			case "tools/call":
				if tname, ok := request.Params["name"].(string); ok {
					if tool, err := FindTool(tname); err != nil {
						SendError(w, request.ID, JSONRPCError{
							Code:    http.StatusBadRequest,
							Message: fmt.Sprintf("Unknown tool: %s", request.Params["name"]),
						})
					} else if res, err := tool.Run(request.Params, userSession); err != nil {
						SendMessage(w, request.ID, ToolResponse{
							Content: []TextContent{{Type: "text", Text: err.Error()}},
							IsError: true,
						})
					} else {
						SendMessage(w, request.ID, res)
					}
				} else {
					SendError(w, request.ID, JSONRPCError{
						Code:    http.StatusBadRequest,
						Message: fmt.Sprintf("Unexpected parameters: %v", request.Params),
					})
				}
			case "notifications/initialized":
				SendMessage(w, request.ID, map[string]string{})
			case "completion/complete":
				SendMessage(w, request.ID, CompletionResponse{
					Completion: ExecCompletion(request.Params, userSession),
				})
			case "ping":
				SendMessage(w, request.ID, map[string]string{})
			default:
				if request.Method == "" && userSession.Ping.ID == request.ID { // response to ping
					userSession.Ping.LastResponse = time.Now()
					userSession.Ping.ID += 1
				} else {
					Log.Warning("plg_handler_mcp::sse message=unknown_method method=%s requestID=%d", request.Method, request.ID)
					SendError(w, request.ID, JSONRPCError{
						Code:    http.StatusMethodNotAllowed,
						Message: fmt.Sprintf("Unknown request: %s", request.Method),
					})
				}
			}
		case <-r.Context().Done():
			this.RemoveSession(userSession)
			return
		case <-time.After(15 * time.Second):
			SendPing(w, userSession.Ping.ID)
			if time.Since(userSession.Ping.LastResponse) > SESSION_TIME*time.Second {
				SendMethod(w, userSession.Ping.ID+1, "notifications/cancelled", map[string]interface{}{
					"requestId": userSession.Ping.ID,
					"reason":    "Request timed out",
				})
				time.Sleep(2 * time.Second)
				this.RemoveSession(userSession)
				if hi, ok := w.(http.Hijacker); ok {
					if conn, rw, err := hi.Hijack(); err == nil {
						rw.WriteString("0\r\n\r\n")
						rw.Flush()
						time.Sleep(1 * time.Second)
						conn.Close()
					}
				}
				return
			}
		}
	}
}

func respondResourceRead(w http.ResponseWriter, request JSONRPCRequest) {
	uri, ok := request.Params["uri"].(string)
	if !ok || uri == "" {
		SendError(w, request.ID, JSONRPCError{
			Code:    http.StatusBadRequest,
			Message: fmt.Sprintf("Unexpected parameters: %v", request.Params),
		})
		return
	}
	resource, err := FindResource(uri)
	if err != nil {
		SendError(w, request.ID, err)
		return
	}
	SendMessage(w, request.ID, &ResourceReadResponse{
		Contents: []ResourceContent{{
			URI:      uri,
			MimeType: resource.MimeType,
			Text:     resource.Content,
			Meta:     resource.Meta,
		}},
	})
}

func getBackend(token string) (IBackend, error) {
	str, err := DecryptString(SECRET_KEY_DERIVATE_FOR_USER, token)
	if err != nil {
		return nil, ErrNotAuthorized
	}
	session := map[string]string{}
	if err = json.Unmarshal([]byte(str), &session); err != nil {
		return nil, err
	}
	return model.NewBackend(&App{
		Context: context.Background(),
	}, session)
}
