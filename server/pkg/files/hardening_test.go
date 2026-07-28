package files

// Chunked-upload and directory-pagination hardening tests. These moved here
// from server/ctrl when upstream split the monolithic ctrl/files.go into this
// package; the symbols they cover (createChunkedUploader, activeChunkedUploads,
// boundedChunkedUploadBody, loadDirectoryPage) live here now.

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"

	. "github.com/mickael-kerjean/filestash/server/common"
)

type testPagedBackend struct {
	Nothing
	called bool
}

func (b *testPagedBackend) LsPage(_ string, cursor string, _ int) ([]os.FileInfo, string, error) {
	b.called = true
	return []os.FileInfo{File{FName: cursor, FType: "file"}}, "next-key", nil
}

type legacyListBackend struct{ Nothing }

func (legacyListBackend) Ls(string) ([]os.FileInfo, error) {
	entries := make([]os.FileInfo, 1001)
	for i := range entries {
		entries[i] = File{FName: strconv.Itoa(i), FType: "file"}
	}
	return entries, nil
}

func TestChunkedUploadCloseAndAbortReleaseActiveSlot(t *testing.T) {
	baseline := activeChunkedUploads.Load()
	var cancelled atomic.Bool
	uploader := createChunkedUploader(func(_ string, r io.Reader) error {
		_, err := io.Copy(io.Discard, r)
		return err
	}, "/upload", 4, func() { cancelled.Store(true) })
	if err := uploader.Next(io.NopCloser(strings.NewReader("test"))); err != nil {
		t.Fatal(err)
	}
	if err := uploader.Close(); err != nil {
		t.Fatal(err)
	}
	if !cancelled.Load() || activeChunkedUploads.Load() != baseline {
		t.Fatalf("close leaked upload: cancelled=%v active=%d baseline=%d", cancelled.Load(), activeChunkedUploads.Load(), baseline)
	}

	aborted := createChunkedUploader(func(_ string, r io.Reader) error {
		_, err := io.Copy(io.Discard, r)
		return err
	}, "/abort", 10, func() {})
	_ = aborted.Abort(context.Canceled)
	if activeChunkedUploads.Load() != baseline {
		t.Fatalf("abort leaked active slot: active=%d baseline=%d", activeChunkedUploads.Load(), baseline)
	}
}

func TestChunkedUploadBodyIsBoundedBeforeStreaming(t *testing.T) {
	res := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPatch, "/api/files/save", strings.NewReader("12345"))
	if _, err := boundedChunkedUploadBody(res, req, 4); err == nil {
		t.Fatal("known oversized body was accepted")
	}

	res = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPatch, "/api/files/save", io.NopCloser(strings.NewReader("12345")))
	req.ContentLength = -1
	reader, err := boundedChunkedUploadBody(res, req, 4)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := io.Copy(io.Discard, reader); err == nil {
		t.Fatal("chunked oversized body streamed past its bound")
	} else if _, ok := err.(*http.MaxBytesError); !ok {
		t.Fatalf("unexpected limit error: %T %v", err, err)
	}
}

func TestLoadDirectoryPageUsesBackendNativeCursor(t *testing.T) {
	backend := &testPagedBackend{}
	entries, next, err := loadDirectoryPage(backend, "/", "row-42", 25, true)
	if err != nil {
		t.Fatal(err)
	}
	if !backend.called || len(entries) != 1 || entries[0].Name() != "row-42" || next != "next-key" {
		t.Fatalf("native page contract not used: called=%v entries=%v next=%q", backend.called, entries, next)
	}
}

func TestLoadDirectoryPageBoundsLegacyBackend(t *testing.T) {
	entries, next, err := loadDirectoryPage(legacyListBackend{}, "/", "", 200, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1000 || next != "offset:1000" {
		t.Fatalf("legacy fallback is not bounded: len=%d next=%q", len(entries), next)
	}
}
