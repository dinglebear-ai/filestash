package model

import (
	"context"
	"path/filepath"
	"testing"

	. "github.com/mickael-kerjean/filestash/server/common"
)

func TestStoreLifecycle(t *testing.T) {
	originalPath := DB_PATH
	DB_PATH = filepath.Clean(t.TempDir())
	t.Cleanup(func() {
		_ = CloseStore()
		DB_PATH = originalPath
	})
	ctx, cancel := context.WithCancel(context.Background())
	if err := InitStore(ctx); err != nil {
		t.Fatal(err)
	}
	if DB == nil {
		t.Fatal("store was not initialized")
	}
	cancel()
	if err := CloseStore(); err != nil {
		t.Fatal(err)
	}
	if DB != nil {
		t.Fatal("store was not released")
	}
}
