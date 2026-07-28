package plg_widget_chat

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	. "github.com/mickael-kerjean/filestash/server/common"
)

func listMessages(ctx *App, w http.ResponseWriter, r *http.Request) {
	path, err := PathBuilder(ctx, r.URL.Query().Get("path"))
	if err != nil {
		SendErrorResult(w, err)
		return
	}
	limit := 100
	if raw := r.URL.Query().Get("limit"); raw != "" {
		value, parseErr := strconv.Atoi(raw)
		if parseErr != nil || value < 1 || value > 200 {
			SendErrorResult(w, NewError("Invalid page limit", http.StatusBadRequest))
			return
		}
		limit = value
	}
	before := time.Now().Add(time.Minute).Unix()
	if raw := r.URL.Query().Get("before"); raw != "" {
		value, parseErr := strconv.ParseInt(raw, 10, 64)
		if parseErr != nil || value < 1 {
			SendErrorResult(w, NewError("Invalid cursor", http.StatusBadRequest))
			return
		}
		before = value
	}
	rows, err := db.QueryContext(r.Context(), `
			SELECT path, author, message, creation_date
				FROM messages
				WHERE path GLOB ? AND creation_date < ?
				ORDER BY creation_date DESC
				LIMIT ?
		`, globAll(path), before, limit)
	if err != nil {
		SendErrorResult(w, err)
		return
	}
	defer rows.Close()

	out := []Message{}
	for rows.Next() {
		var m Message
		if err := rows.Scan(
			&m.Path,
			&m.Author,
			&m.Message,
			&m.CreatedAt,
		); err != nil {
			SendErrorResult(w, err)
			return
		}
		if ctx.Session["path"] != "" {
			m.Path = strings.TrimPrefix(m.Path, strings.TrimSuffix(ctx.Session["path"], "/"))
		}
		out = append(out, m)
	}
	for left, right := 0, len(out)-1; left < right; left, right = left+1, right-1 {
		out[left], out[right] = out[right], out[left]
	}
	if len(out) == limit {
		w.Header().Set("X-Next-Cursor", strconv.FormatInt(out[0].CreatedAt, 10))
	}
	SendSuccessResults(w, out)
}

func createMessage(ctx *App, w http.ResponseWriter, r *http.Request) {
	path, err := PathBuilder(ctx, r.URL.Query().Get("path"))
	if err != nil {
		SendErrorResult(w, err)
		return
	}
	msg, ok := ctx.Body["message"].(string)
	if !ok || len(msg) == 0 || len(msg) > 16<<10 {
		SendErrorResult(w, NewError("Invalid parameters", 400))
		return
	}
	author := getUser(ctx.Session)
	_, err = db.ExecContext(ctx.Context, `
		INSERT INTO messages(id, path, author, message, creation_date)
		VALUES(?,?,?,?,?)
	`, newID(), path, author, msg, time.Now().Unix())
	if err != nil {
		SendErrorResult(w, err)
		return
	}
	_, _ = db.ExecContext(ctx.Context, `DELETE FROM messages WHERE creation_date < ?`, time.Now().Add(-90*24*time.Hour).Unix())

	extractMentions := func(message string) []string {
		matches := mention_re.FindAllStringSubmatch(message, -1)
		out := make([]string, 0, len(matches))
		for _, m := range matches {
			name := strings.TrimSpace(m[1])
			if name != "" {
				out = append(out, name)
			}
		}
		return out
	}
	for _, name := range extractMentions(msg) {
		go processMention(map[string]string{
			"path":    path,
			"author":  author,
			"mention": name,
			"message": msg,
		})
	}
	SendSuccessResult(w, nil)
}

func lookupUsers(ctx *App, w http.ResponseWriter, r *http.Request) {
	if ctx.Share.Id != "" {
		SendSuccessResults(w, []DirectoryUser{})
		return
	}
	dir := Hooks.Get.DirectoryService()
	if dir == nil {
		SendSuccessResults(w, []DirectoryUser{})
		return
	}
	results, err := dir.Search(r.URL.Query().Get("q"))
	if err != nil {
		SendErrorResult(w, err)
		return
	}
	SendSuccessResults(w, results)
}
