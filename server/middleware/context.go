package middleware

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	. "github.com/mickael-kerjean/filestash/server/common"
)

const DefaultJSONBodyLimit int64 = 1 << 20

func BodyParserWithLimit(maxBytes int64) Middleware {
	return func(fn HandlerFunc) HandlerFunc {
		extractBody := func(req *http.Request) (map[string]interface{}, error) {
			body := map[string]interface{}{}
			decoder := json.NewDecoder(req.Body)
			decoder.UseNumber()
			decoder.DisallowUnknownFields()
			if err := decoder.Decode(&body); err != nil {
				if err.Error() == "EOF" {
					return body, nil
				}
				return body, err
			}
			if err := decoder.Decode(&struct{}{}); err != io.EOF {
				return body, ErrNotValid
			}
			return body, nil
		}

		return HandlerFunc(func(ctx *App, res http.ResponseWriter, req *http.Request) {
			req.Body = http.MaxBytesReader(res, req.Body, maxBytes)
			var err error
			if ctx.Body, err = extractBody(req); err != nil {
				if strings.Contains(err.Error(), "request body too large") {
					SendErrorResult(res, NewError("Request body too large", http.StatusRequestEntityTooLarge))
					return
				}
				SendErrorResult(res, ErrNotValid)
				return
			}
			fn(ctx, res, req)
		})
	}
}

func BodyParser(fn HandlerFunc) HandlerFunc {
	return BodyParserWithLimit(DefaultJSONBodyLimit)(fn)
}
