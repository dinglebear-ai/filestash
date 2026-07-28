package files

import (
	"bytes"
	"context"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"hash"
	"hash/crc32"
	"io"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	. "github.com/mickael-kerjean/filestash/server/common"
	"github.com/mickael-kerjean/filestash/server/pkg/permissions"
)

var chunkedUploadCache AppCache

// Bounds on resumable (TUS) uploads. Without these a client can pin an
// unbounded number of backend goroutines open, declare an arbitrarily large
// Upload-Length, or stream a single PATCH body with no ceiling.
const (
	maxActiveChunkedUploads = 32
	maxChunkedUploadSize    = uint64(1 << 40)
	maxChunkedUploadPatch   = uint64(64 << 20)
)

var activeChunkedUploads atomic.Int64

func init() {
	initChunkedUploader()
}

func FileSave(ctx *App, res http.ResponseWriter, req *http.Request) {
	h := res.Header()
	h.Set("Cache-Control", "no-store")
	h.Set("Pragma", "no-cache")
	h.Set("Connection", "Close")

	if req.Method == http.MethodOptions {
		h.Set("Accept-Post", "application/offset+octet-stream, application/vnd.filestash.delta.rdiff")
		return
	}

	path, err := PathBuilder(ctx, req.URL.Query().Get("path"))
	if err != nil {
		Log.Debug("files::save action=path_builder err=%s", err.Error())
		SendErrorResult(res, err)
		return
	}

	if permissions.CanEdit(ctx) == false {
		if permissions.CanUpload(ctx) == false {
			Log.Debug("files::save action=permission_upload err=permission_denied")
			SendErrorResult(res, ErrPermissionDenied)
			return
		}
		// for user who cannot edit but can upload => we want to ensure there
		// won't be any overwritten data
		root, filename := SplitPath(path)
		entries, err := ctx.Backend.Ls(root)
		if err != nil {
			Log.Debug("files::save action=permission_ls err=%s", err.Error())
			SendErrorResult(res, ErrPermissionDenied)
			return
		}
		for i := 0; i < len(entries); i++ {
			if entries[i].Name() == filename {
				Log.Debug("files::save action=permission_ls err=already_exist")
				SendErrorResult(res, ErrConflict)
				return
			}
		}
	}

	for _, auth := range Hooks.Get.AuthorisationMiddleware() {
		if err = auth.Save(ctx, path); err != nil {
			Log.Info("files::save action=middleware err=%s", err.Error())
			SendErrorResult(res, ErrNotAuthorized)
			return
		}
	}

	proto := ""
	if strings.HasPrefix(req.Header.Get("Content-Type"), "application/vnd.filestash.delta.rdiff") {
		proto = "rdiff"
	} else if _, ok := req.Header["Tus-Resumable"]; ok {
		proto = "tus"
	}
	switch proto {
	case "":
		handlerClassic(ctx, res, req, path, h)
	case "tus":
		handlerTUS(ctx, res, req, path, h)
	case "rdiff":
		handlerRDIFF(ctx, res, req, path, h)
	default:
		SendErrorResult(res, ErrNotImplemented)
	}
}

func handlerClassic(ctx *App, res http.ResponseWriter, req *http.Request, path string, h http.Header) {
	if req.Method != http.MethodPost {
		SendErrorResult(res, ErrNotFound)
		return
	}

	since := req.Header.Get("If-Unmodified-Since")
	if since != "" {
		expected, err := http.ParseTime(since)
		if err != nil {
			Log.Debug("files::save action=precondition err=%s", err.Error())
			SendErrorResult(res, ErrNotValid)
			return
		} else if finfo, err := ctx.Backend.Stat(path); err == nil && finfo.ModTime().Unix() != expected.Unix() {
			SendErrorResult(res, NewError("Modified since", http.StatusPreconditionFailed))
			return
		}
	}
	err := ctx.Backend.Save(path, req.Body)
	req.Body.Close()
	if err != nil {
		Log.Debug("files::save action=backend_save err=%s", err.Error())
		SendErrorResult(res, NewError(err.Error(), 403))
		return
	}
	if since != "" {
		if finfo, err := ctx.Backend.Stat(path); err == nil && finfo.ModTime().Unix() > 0 {
			h.Set("Last-Modified", finfo.ModTime().UTC().Format(http.TimeFormat))
		}
	}
	SendSuccessResult(res, nil)
	return
}

func handlerTUS(ctx *App, res http.ResponseWriter, req *http.Request, path string, h http.Header) {
	cacheKey := map[string]string{
		"path":    path,
		"session": GenerateID(ctx.Session),
	}
	if req.Method == http.MethodHead {
		c := chunkedUploadCache.Get(cacheKey)
		if c == nil {
			SendErrorResult(res, ErrNotFound)
			return
		}
		offset, length := c.(*chunkedUpload).Meta()
		h.Set("Tus-Resumable", "1.0.0")
		h.Set("Upload-Offset", fmt.Sprintf("%d", offset))
		h.Set("Upload-Length", fmt.Sprintf("%d", length))
		h.Set("Cache-Control", "no-store")
		res.WriteHeader(http.StatusNoContent)
		return
	}
	if req.Method == http.MethodPost {
		if c := chunkedUploadCache.Get(cacheKey); c != nil {
			chunkedUploadCache.Del(cacheKey)
		}
		size, err := strconv.ParseUint(req.Header.Get("Upload-Length"), 10, 0)
		if err != nil || size > maxChunkedUploadSize {
			Log.Debug("files::save::tus action=backend_save step=header_check_post err=%v", err)
			SendErrorResult(res, ErrNotValid)
			return
		}
		if activeChunkedUploads.Load() >= maxActiveChunkedUploads {
			SendErrorResult(res, NewError("Too many active uploads", http.StatusServiceUnavailable))
			return
		}
		uploadContext, cancelUpload := context.WithCancel(context.Background())
		ctx.Context = uploadContext
		b, err := ctx.Backend.Init(ctx.Session, ctx)
		if err != nil {
			cancelUpload()
			Log.Debug("files::save::tus action=backend_save step=backend_init err=%s", err.Error())
			SendErrorResult(res, ErrNotValid)
			return
		}
		uploader := createChunkedUploader(b.Save, path, size, cancelUpload)
		chunkedUploadCache.Set(cacheKey, uploader)
		h.Set("Tus-Resumable", "1.0.0")
		h.Set("Content-Length", "0")
		h.Set("Location", req.URL.String())
		res.WriteHeader(http.StatusCreated)
		return
	}
	if req.Method == http.MethodPatch {
		if req.Header.Get("Content-Type") != "application/offset+octet-stream" {
			SendErrorResult(res, NewError("Unsupported Media Type", 415))
			return
		}
		var (
			hash             hash.Hash
			expectedChecksum string
		)
		if checksumHeader := req.Header.Get("upload-checksum"); checksumHeader != "" {
			parts := strings.SplitN(checksumHeader, " ", 2)
			if len(parts) != 2 {
				SendErrorResult(res, NewError("Bad Request", 400))
				return
			} else if parts[0] == "sha1" {
				hash = sha1.New()
			} else if parts[0] == "crc32" {
				hash = crc32.NewIEEE()
			} else {
				SendErrorResult(res, NewError("Bad Request", 400))
				return
			}
			expectedChecksum = parts[1]
		}
		requestOffset, err := strconv.ParseUint(req.Header.Get("Upload-Offset"), 10, 0)
		if err != nil {
			Log.Debug("files::save::tus action=backend_save step=header_check_patch err=%s", err.Error())
			SendErrorResult(res, ErrNotValid)
			return
		}
		c := chunkedUploadCache.Get(cacheKey)
		if c == nil {
			Log.Debug("files::save::tus action=backend_save step=cache_fetch_patch")
			SendErrorResult(res, NewError("Conflict", 409))
			return
		}
		uploader := c.(*chunkedUpload)
		initialOffset, totalSize := uploader.Meta()
		if initialOffset > totalSize {
			uploader.Abort(ErrNotValid)
			chunkedUploadCache.Del(cacheKey)
			SendErrorResult(res, ErrNotValid)
			return
		}
		if initialOffset != requestOffset {
			Log.Debug("files::save::tus action=uploader.next path=%s err=offset_missmatch", path)
			SendErrorResult(res, ErrNotValid)
			return
		}
		reader, err := boundedChunkedUploadBody(res, req, totalSize-initialOffset)
		if err != nil {
			SendErrorResult(res, NewError("Upload chunk is too large", http.StatusRequestEntityTooLarge))
			return
		}
		if hash != nil {
			reader = io.NopCloser(io.TeeReader(reader, hash))
		}
		if err := uploader.Next(reader); err != nil {
			uploader.Abort(err)
			chunkedUploadCache.Del(cacheKey)
			Log.Debug("files::save::tus action=uploader.next path=%s err=%s", path, err.Error())
			var maxBytesErr *http.MaxBytesError
			if errors.As(err, &maxBytesErr) {
				SendErrorResult(res, NewError("Upload chunk is too large", http.StatusRequestEntityTooLarge))
				return
			}
			SendErrorResult(res, NewError(err.Error(), 403))
			return
		}
		if hash != nil && expectedChecksum != hex.EncodeToString(hash.Sum(nil)) {
			uploader.Abort(ErrNotValid)
			chunkedUploadCache.Del(cacheKey)
			SendErrorResult(res, NewError("Checksum Mismatch", 460))
			return
		}
		newOffset, _ := uploader.Meta()
		chunkedUploadCache.Set(cacheKey, uploader)
		if newOffset > totalSize {
			uploader.Close()
			chunkedUploadCache.Del(cacheKey)
			Log.Warning("files::save::tus path=%s err=assert_offset size=%d old_offset=%d new_offset=%d", path, totalSize, initialOffset, newOffset)
			SendErrorResult(res, NewError("aborted - offset larger than total size", 403))
			return
		} else if newOffset == totalSize {
			if err := uploader.Close(); err != nil {
				Log.Debug("files::save::tus action=uploader.close err=%s", err.Error())
				SendErrorResult(res, ErrNotValid)
				return
			}
			chunkedUploadCache.Del(cacheKey)
		}
		h.Set("Tus-Resumable", "1.0.0")
		h.Set("Upload-Offset", fmt.Sprintf("%d", newOffset))
		res.WriteHeader(http.StatusNoContent)
		return
	}
	SendErrorResult(res, ErrNotFound)
}

func handlerRDIFF(ctx *App, res http.ResponseWriter, req *http.Request, path string, h http.Header) {
	if req.Method != http.MethodPost {
		SendErrorResult(res, ErrNotFound)
		return
	}
	basePath := path
	if hdr := req.Header.Get("X-Copy-Source"); hdr != "" {
		root, _ := SplitPath(path)
		basePath = JoinPath(root, filepath.Base(hdr))
	}
	since := req.Header.Get("If-Unmodified-Since")
	if since != "" {
		expected, err := http.ParseTime(since)
		if err != nil {
			Log.Debug("files::save::rdiff action=precondition err=%s", err.Error())
			SendErrorResult(res, ErrNotValid)
			return
		} else if finfo, err := ctx.Backend.Stat(basePath); err == nil && finfo.ModTime().Unix() != expected.Unix() {
			SendErrorResult(res, NewError("Modified since", http.StatusPreconditionFailed))
			return
		}
	}

	remote, err := ctx.Backend.Cat(basePath)
	if err != nil {
		Log.Debug("files::save::rdiff action=backend_cat err=%s", err.Error())
		SendErrorResult(res, ErrNotFound)
		return
	}
	defer remote.Close()
	root, filename := SplitPath(path)
	part := root + "." + filename + ".part_" + QuickString(8)
	hasher := sha256.New()
	reader, writer := io.Pipe()
	saved := make(chan error, 1)
	go func() {
		saved <- ctx.Backend.Save(part, reader)
	}()
	abort := func(err error, status int) {
		writer.CloseWithError(err)
		<-saved
		if err := ctx.Backend.Rm(part); err != nil {
			Log.Debug("files::save::rdiff action=part_cleanup err=%s", err.Error())
		}
		Log.Debug("files::save::rdiff action=patch err=%s", err.Error())
		SendErrorResult(res, NewError(err.Error(), status))
	}
	if err = rdiffPatch(remote, req.Body, io.MultiWriter(writer, hasher)); err != nil {
		abort(err, 403)
		return
	}
	expected := make([]byte, sha256.Size)
	if _, err = io.ReadFull(req.Body, expected); err != nil {
		abort(err, 403)
		return
	}
	writer.Close()
	if err = <-saved; err != nil {
		abort(err, 403)
		return
	}
	if bytes.Equal(hasher.Sum(nil), expected) == false {
		if err := ctx.Backend.Rm(part); err != nil {
			Log.Debug("files::save::rdiff action=part_cleanup err=%s", err.Error())
		}
		SendErrorResult(res, NewError("Checksum Mismatch", 460))
		return
	}
	if err = ctx.Backend.Mv(part, path); err != nil {
		if ctx.Backend.Rm(path) == nil {
			err = ctx.Backend.Mv(part, path)
		}
	}
	if err != nil {
		Log.Debug("files::save::rdiff action=commit err=%s", err.Error())
		if err := ctx.Backend.Rm(part); err != nil {
			Log.Debug("files::save::rdiff action=part_cleanup err=%s", err.Error())
		}
		SendErrorResult(res, NewError(err.Error(), 403))
		return
	}
	if finfo, err := ctx.Backend.Stat(path); err == nil && finfo.ModTime().Unix() > 0 {
		h.Set("Last-Modified", finfo.ModTime().UTC().Format(http.TimeFormat))
	}
	SendSuccessResult(res, nil)
}

// boundedChunkedUploadBody caps a single PATCH body at the smaller of the
// per-chunk ceiling and what the declared Upload-Length still has outstanding,
// so neither a lying Content-Length nor a chunked body can overrun it.
func boundedChunkedUploadBody(res http.ResponseWriter, req *http.Request, remaining uint64) (io.ReadCloser, error) {
	limit := maxChunkedUploadPatch
	if remaining < limit {
		limit = remaining
	}
	if req.ContentLength >= 0 && uint64(req.ContentLength) > limit {
		return nil, &http.MaxBytesError{Limit: int64(limit)}
	}
	return http.MaxBytesReader(res, req.Body, int64(limit)), nil
}

func createChunkedUploader(save func(path string, file io.Reader) error, path string, size uint64, cancel context.CancelFunc) *chunkedUpload {
	r, w := io.Pipe()
	done := make(chan error, 1)
	activeChunkedUploads.Add(1)
	go func() {
		done <- save(path, r)
	}()
	return &chunkedUpload{
		fn:     save,
		stream: w,
		done:   done,
		offset: 0,
		size:   size,
		cancel: cancel,
	}
}

func initChunkedUploader() {
	// A day-long TTL kept abandoned uploads (and their backend goroutines)
	// resident; 15 minutes still covers a stalled client resuming.
	chunkedUploadCache = NewAppCache(15, 1)
	chunkedUploadCache.OnEvict(func(key string, value interface{}) {
		c := value.(*chunkedUpload)
		if c == nil {
			Log.Warning("ctrl::files::chunked::cleanup nil on close")
			return
		}
		if err := c.Abort(context.Canceled); err != nil && err != context.Canceled {
			Log.Warning("ctrl::files::chunked::cleanup action=close err=%s", err.Error())
			return
		}
	})
}

type chunkedUpload struct {
	fn       func(path string, file io.Reader) error
	stream   *io.PipeWriter
	offset   uint64
	size     uint64
	done     chan error
	cancel   context.CancelFunc
	once     sync.Once
	mu       sync.Mutex
	writeMu  sync.Mutex
	closeErr error
}

func (this *chunkedUpload) Next(body io.ReadCloser) error {
	this.writeMu.Lock()
	defer this.writeMu.Unlock()
	n, err := io.Copy(this.stream, body)
	body.Close()
	this.mu.Lock()
	this.offset += uint64(n)
	this.mu.Unlock()
	return err
}

// Close and Abort both run exactly once and memoize their result. The previous
// implementation read from this.done and then closed it inside the once, so a
// second caller blocked forever on a closed channel.
func (this *chunkedUpload) Close() error {
	this.once.Do(func() {
		if err := this.stream.Close(); err != nil {
			this.closeErr = err
		} else {
			this.closeErr = <-this.done
		}
		this.cancel()
		activeChunkedUploads.Add(-1)
	})
	return this.closeErr
}

// Abort tears down a failed upload, cancelling the backend context so a wedged
// Save cannot hold the slot open indefinitely.
func (this *chunkedUpload) Abort(cause error) error {
	this.once.Do(func() {
		this.cancel()
		_ = this.stream.CloseWithError(cause)
		select {
		case this.closeErr = <-this.done:
		case <-time.After(5 * time.Second):
			this.closeErr = context.DeadlineExceeded
		}
		activeChunkedUploads.Add(-1)
	})
	return this.closeErr
}

func (this *chunkedUpload) Meta() (uint64, uint64) {
	this.mu.Lock()
	defer this.mu.Unlock()
	return this.offset, this.size
}
