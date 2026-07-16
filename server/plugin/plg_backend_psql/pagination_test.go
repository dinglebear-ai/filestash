package plg_backend_psql

import (
	"os"
	"testing"

	. "github.com/mickael-kerjean/filestash/server/common"
)

func TestTrimPSQLPageReturnsLastEmittedKey(t *testing.T) {
	entries := []os.FileInfo{
		File{FName: "one.form", FType: "file"},
		File{FName: "two.form", FType: "file"},
		File{FName: "three.form", FType: "file"},
	}
	page, cursor, err := trimPSQLPage(entries, 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(page) != 2 || cursor != "two.form" {
		t.Fatalf("page=%v cursor=%q", page, cursor)
	}
}
