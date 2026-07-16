package plg_backend_psql

import (
	"os"
	"strconv"
	"strings"
	"time"

	. "github.com/mickael-kerjean/filestash/server/common"
)

func (this PSQL) Ls(path string) ([]os.FileInfo, error) {
	entries, _, err := this.LsPage(path, "", 1000)
	return entries, err
}

func (this PSQL) LsPage(path string, cursor string, limit int) ([]os.FileInfo, string, error) {
	defer this.Close()
	if limit < 1 || limit > 1000 {
		return nil, "", ErrNotValid
	}
	l, err := getPath(path)
	if err != nil {
		Log.Debug("pl_backend_psql::ls method=getPath err=%s", err.Error())
		return nil, "", err
	}
	if l.table == "" {
		rows, err := this.db.QueryContext(this.ctx, `
            SELECT table_name FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_type = 'BASE TABLE'
				AND ($1 = '' OR table_name > $1)
			ORDER BY table_name
			LIMIT $2
		`, cursor, limit+1)
		if err != nil {
			Log.Debug("plg_backend_psql::ls method=query err=%s", err.Error())
			return nil, "", err
		}
		defer rows.Close()
		out := []os.FileInfo{}
		for rows.Next() {
			var name string
			if err := rows.Scan(&name); err != nil {
				Log.Debug("plg_backend_psql::ls method=scan err=%s", err.Error())
				return nil, "", err
			}
			out = append(out, File{
				FName: name,
				FType: "directory",
			})
		}
		return trimPSQLPage(out, limit)
	} else if l.row == "" {
		columns, key, err := processTable(this.ctx, this.db, l.table)
		if err != nil {
			return nil, "", err
		}
		query := `SELECT "` + key + `", NULL FROM "` + l.table + `"`
		for _, c := range columns {
			if c.Type == "timestamptz" {
				query = `SELECT "` + key + `", "` + c.Name + `" FROM "` + l.table + `"`
				break
			}
		}
		args := []any{}
		if cursor != "" {
			query += ` WHERE "` + key + `" > $1`
			args = append(args, strings.TrimSuffix(cursor, ".form"))
		}
		query += ` ORDER BY "` + key + `" LIMIT $` + strconv.Itoa(len(args)+1)
		args = append(args, limit+1)
		rows, err := this.db.QueryContext(this.ctx, query, args...)
		if err != nil {
			return nil, "", err
		}
		defer rows.Close()
		out := []os.FileInfo{}
		for rows.Next() {
			var name string
			var t *time.Time
			if err = rows.Scan(&name, &t); err != nil {
				return nil, "", err
			}
			out = append(out, File{
				FName: name + ".form",
				FType: "file",
				FTime: func() int64 {
					if t == nil {
						return 0
					}
					return t.Unix()
				}(),
				FSize: -1,
			})
		}
		return trimPSQLPage(out, limit)
	}
	return []os.FileInfo{}, "", ErrNotValid
}

func trimPSQLPage(entries []os.FileInfo, limit int) ([]os.FileInfo, string, error) {
	if len(entries) <= limit {
		return entries, "", nil
	}
	entries = entries[:limit]
	return entries, entries[len(entries)-1].Name(), nil
}
