package files

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"hash/crc32"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	. "github.com/mickael-kerjean/filestash/server/common"
	"github.com/mickael-kerjean/filestash/server/pkg/permissions"
)

type FileInfo struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	Size     int64  `json:"size"`
	Time     int64  `json:"time"`
	Offline  bool   `json:"offline,omitempty"`
	Metadata any    `json:"metadata,omitempty"`
}

func FileLs(ctx *App, res http.ResponseWriter, req *http.Request) {
	if permissions.CanRead(ctx) == false {
		if permissions.CanUpload(ctx) == false {
			Log.Debug("ls::permission 'permission denied'")
			SendErrorResult(res, ErrPermissionDenied)
			return
		}
		SendSuccessResults(res, make([]FileInfo, 0))
		return
	}
	path, err := PathBuilder(ctx, req.URL.Query().Get("path"))
	if err != nil {
		Log.Debug("ls::path '%s'", err.Error())
		SendErrorResult(res, err)
		return
	}
	perms := Metadata{}
	if obj, ok := ctx.Backend.(interface{ Meta(path string) Metadata }); ok {
		perms = obj.Meta(path)
	}
	for _, auth := range Hooks.Get.AuthorisationMiddleware() {
		if err = auth.Ls(ctx, path); err != nil {
			Log.Info("ls::auth '%s'", err.Error())
			SendErrorResult(res, err)
			return
		}
		ctx.Context = context.WithValue(ctx.Context, "AUDIT", false)
		if err = auth.Mkdir(ctx, path); err != nil {
			perms.CanCreateDirectory = NewBool(false)
		}
		if err = auth.Touch(ctx, path); err != nil {
			perms.CanCreateFile = NewBool(false)
		}
		if err = auth.Mv(ctx, path, path); err != nil {
			perms.CanRename = NewBool(false)
			perms.CanMove = NewBool(false)
		}
		if err = auth.Save(ctx, path); err != nil {
			perms.CanUpload = NewBool(false)
		}
		if err = auth.Rm(ctx, path); err != nil {
			perms.CanDelete = NewBool(false)
		}
		if err = auth.Cat(ctx, path); err != nil {
			perms.CanSee = NewBool(false)
		}
		ctx.Context = context.WithValue(ctx.Context, "AUDIT", nil)
	}
	if permissions.CanEdit(ctx) == false {
		perms.CanCreateFile = NewBool(false)
		perms.CanCreateDirectory = NewBool(false)
		perms.CanRename = NewBool(false)
		perms.CanMove = NewBool(false)
		perms.CanDelete = NewBool(false)
		perms.CanUpload = NewBool(false)
	}
	if permissions.CanUpload(ctx) == false {
		perms.CanCreateDirectory = NewBool(false)
		perms.CanRename = NewBool(false)
		perms.CanMove = NewBool(false)
		perms.CanDelete = NewBool(false)
		perms.CanUpload = NewBool(false)
	}
	if permissions.CanShare(ctx) == false {
		perms.CanShare = NewBool(false)
	}

	limit, cursor, explicitlyPaged, err := directoryPageParams(req)
	if err != nil {
		SendErrorResult(res, err)
		return
	}
	entries, nextCursor, err := loadDirectoryPage(ctx.Backend, path, cursor, limit, explicitlyPaged)
	if err != nil {
		Log.Debug("ls::backend '%s'", err.Error())
		SendErrorResult(res, err)
		return
	}
	if nextCursor != "" {
		res.Header().Set("X-Next-Cursor", base64.RawURLEncoding.EncodeToString([]byte(nextCursor)))
	}
	res.Header().Set("X-Result-Limit", strconv.Itoa(limit))

	files := make([]FileInfo, len(entries))
	etagger := crc32.NewIEEE()
	json.NewEncoder(etagger).Encode(perms)
	etagger.Write([]byte(path + strconv.Itoa(len(entries))))
	for i := 0; i < len(entries); i++ {
		name := entries[i].Name()
		files[i] = FileInfo{
			Name: name,
			Size: entries[i].Size(),
			Time: func(mt time.Time) (modTime int64) {
				if mt.IsZero() == false {
					modTime = mt.UnixNano() / int64(time.Millisecond)
				}
				etagger.Write([]byte(name + strconv.Itoa(int(modTime))))
				return modTime
			}(entries[i].ModTime()),
			Type: func(mode os.FileMode) string {
				if mode.IsRegular() {
					return "file"
				}
				return "directory"
			}(entries[i].Mode()),
			Metadata: entries[i].Sys(),
		}
		if f, ok := entries[i].Sys().(File); ok {
			files[i].Offline = f.Offline
			files[i].Metadata = f.Metadata
		}
	}

	etagValue := base64.StdEncoding.EncodeToString(etagger.Sum(nil))
	res.Header().Set("Etag", etagValue)
	if etagValue != "" && req.Header.Get("If-None-Match") == etagValue {
		res.WriteHeader(http.StatusNotModified)
		return
	}
	SendSuccessResultsWithMetadata(res, files, perms)
}

// directoryPageParams reads the opaque pagination controls off the request.
// Absent params mean "unpaged client", which keeps the legacy bounded path in
// loadDirectoryPage rather than silently truncating to the default limit.
func directoryPageParams(req *http.Request) (limit int, cursor string, explicitlyPaged bool, err error) {
	limit = 200
	if rawLimit := req.URL.Query().Get("limit"); rawLimit != "" {
		explicitlyPaged = true
		limit, err = strconv.Atoi(rawLimit)
		if err != nil || limit < 1 || limit > 1000 {
			return 0, "", false, NewError("Invalid page limit", http.StatusBadRequest)
		}
	}
	if rawCursor := req.URL.Query().Get("cursor"); rawCursor != "" {
		explicitlyPaged = true
		decoded, decodeErr := base64.RawURLEncoding.DecodeString(rawCursor)
		if decodeErr != nil || len(decoded) > 4096 {
			return 0, "", false, NewError("Invalid cursor", http.StatusBadRequest)
		}
		cursor = string(decoded)
	}
	return limit, cursor, explicitlyPaged, nil
}

// loadDirectoryPage pushes the cursor down to backends that can page natively
// (IPagedBackend) and otherwise slices a full Ls result, so a huge directory
// cannot be materialized into an unbounded response.
func loadDirectoryPage(backend IBackend, path string, cursor string, limit int, explicitlyPaged bool) ([]os.FileInfo, string, error) {
	if paged, ok := backend.(IPagedBackend); ok {
		return paged.LsPage(path, cursor, limit)
	}
	entries, err := backend.Ls(path)
	if err != nil {
		return nil, "", err
	}
	legacyLimit := limit
	if !explicitlyPaged {
		legacyLimit = 1000
	}
	offset := 0
	if cursor != "" {
		rawOffset := strings.TrimPrefix(cursor, "offset:")
		parsed, parseErr := strconv.Atoi(rawOffset)
		if parseErr != nil || parsed < 0 || parsed > len(entries) {
			return nil, "", NewError("Invalid cursor", http.StatusBadRequest)
		}
		offset = parsed
	}
	end := offset + legacyLimit
	if end > len(entries) {
		end = len(entries)
	}
	next := ""
	if end < len(entries) {
		next = "offset:" + strconv.Itoa(end)
	}
	return entries[offset:end], next, nil
}
