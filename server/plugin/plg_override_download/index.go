package plg_override_download

import (
	"embed"
	"io/fs"

	. "github.com/mickael-kerjean/filestash/server/common"
)

//go:embed assets/*
var STATIC embed.FS

func init() {
	patch, err := fs.ReadFile(STATIC, "assets/pages/filespage/thing.js")
	if err != nil {
		Log.Warning("plg_override_download: cannot load patch: %s", err.Error())
		return
	}
	Hooks.Register.StaticPatch(patch)
}
