package model

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"time"

	. "github.com/mickael-kerjean/filestash/server/common"
)

var DB *sql.DB
var storeMu sync.Mutex
var storeCancel context.CancelFunc

func InitStore(ctx context.Context) error {
	storeMu.Lock()
	defer storeMu.Unlock()
	if DB != nil {
		return nil
	}
	db, err := sql.Open("sqlite3", GetAbsolutePath(DB_PATH)+"/share.sql?_fk=true")
	if err != nil {
		return err
	}
	statements := []string{
		"CREATE TABLE IF NOT EXISTS Location(backend VARCHAR(16), path VARCHAR(512), CONSTRAINT pk_location PRIMARY KEY(backend, path))",
		"CREATE TABLE IF NOT EXISTS Share(id VARCHAR(64) PRIMARY KEY, related_backend VARCHAR(16), related_path VARCHAR(512), params JSON, auth VARCHAR(4093) NOT NULL, FOREIGN KEY (related_backend, related_path) REFERENCES Location(backend, path) ON UPDATE CASCADE ON DELETE CASCADE)",
		"CREATE TABLE IF NOT EXISTS Verification(key VARCHAR(512), code VARCHAR(4), expire DATETIME DEFAULT (datetime('now', '+10 minutes')))",
		"CREATE INDEX IF NOT EXISTS idx_verification ON Verification(code, expire)",
	}
	for _, statement := range statements {
		if _, err := db.Exec(statement); err != nil {
			db.Close()
			return fmt.Errorf("share store migration: %w", err)
		}
	}
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return err
	}
	DB = db
	cleanupCtx, cancel := context.WithCancel(ctx)
	storeCancel = cancel
	go autovacuum(cleanupCtx, db)
	return nil
}

func CloseStore() error {
	storeMu.Lock()
	defer storeMu.Unlock()
	if storeCancel != nil {
		storeCancel()
		storeCancel = nil
	}
	if DB == nil {
		return nil
	}
	err := DB.Close()
	DB = nil
	return err
}

func autovacuum(ctx context.Context, db *sql.DB) {
	cleanup := func() {
		_, _ = db.ExecContext(ctx, "DELETE FROM Verification WHERE expire < datetime('now')")
		_, _ = db.ExecContext(ctx, "DELETE FROM Share WHERE CAST(json_extract(params, '$.expire') AS INTEGER) > 0 AND CAST(json_extract(params, '$.expire') AS INTEGER) < ?", time.Now().UnixMilli())
		_, _ = db.ExecContext(ctx, "DELETE FROM Location WHERE NOT EXISTS (SELECT 1 FROM Share WHERE related_backend = Location.backend AND related_path = Location.path)")
	}
	cleanup()
	ticker := time.NewTicker(6 * time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			cleanup()
		}
	}
}
