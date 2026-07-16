package ctrl

import (
	. "github.com/mickael-kerjean/filestash/server/common"
	"io"
	"net/http"
)

var configpath = GetAbsolutePath(CONFIG_PATH, "config.json")

func PrivateConfigHandler(ctx *App, res http.ResponseWriter, req *http.Request) {
	SendSuccessResult(res, &Config)
}

func PrivateConfigUpdateHandler(ctx *App, res http.ResponseWriter, req *http.Request) {
	req.Body = http.MaxBytesReader(res, req.Body, 2<<20)
	b, err := io.ReadAll(req.Body)
	if err != nil {
		if len(b) >= 2<<20 {
			SendErrorResult(res, NewError("Request body too large", http.StatusRequestEntityTooLarge))
			return
		}
		SendErrorResult(res, ErrNotValid)
		return
	}
	if err := Config.ApplyPatch(b); err != nil {
		SendErrorResult(res, err)
		return
	}
	SendSuccessResult(res, nil)
}

func PublicConfigHandler(ctx *App, res http.ResponseWriter, req *http.Request) {
	cfg := Config.Export()
	SendSuccessResultWithEtagAndGzip(res, req, cfg)
}
