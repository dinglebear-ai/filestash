package plg_backend_mysql

import (
	"testing"
	"time"
)

func TestMysqlCatalogTimestampPrefersUpdate(t *testing.T) {
	create := "2025-01-01 00:00:00"
	update := "2026-01-01 00:00:00"
	want, _ := time.Parse("2006-01-02 15:04:05", update)
	if got := mysqlCatalogTimestamp(create, update); got != want.Unix() {
		t.Fatalf("got=%d want=%d", got, want.Unix())
	}
}
