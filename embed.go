package embed

import (
	"embed"
	"io/fs"
	"net/http"
	"os"
)

var (
	// `all:` is required so files/dirs starting with `_` or `.` are embedded —
	// Next.js ships its assets under `_next/`, which a bare `//go:embed public`
	// silently skips.
	//go:embed all:public
	wwwPublic embed.FS
	WWWPublic http.FileSystem = http.FS(os.DirFS("./public/"))
)

//go:embed server/plugin/index.go
var EmbedPluginList []byte

func init() {
	if os.Getenv("DEBUG") != "true" {
		fsPublic, _ := fs.Sub(wwwPublic, "public")
		WWWPublic = http.FS(fsPublic)
	}
}
