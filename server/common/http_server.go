package common

import (
	"context"
	"net/http"
	"time"
)

const (
	HTTPReadHeaderTimeout = 10 * time.Second
	HTTPReadTimeout       = 60 * time.Minute
	HTTPWriteTimeout      = 60 * time.Minute
	HTTPIdleTimeout       = 2 * time.Minute
	HTTPShutdownTimeout   = 15 * time.Second
	HTTPMaxHeaderBytes    = 1 << 20
)

func NewHTTPServer(addr string, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: HTTPReadHeaderTimeout,
		ReadTimeout:       HTTPReadTimeout,
		WriteTimeout:      HTTPWriteTimeout,
		IdleTimeout:       HTTPIdleTimeout,
		MaxHeaderBytes:    HTTPMaxHeaderBytes,
	}
}

func ShutdownHTTPServer(server *http.Server) error {
	ctx, cancel := context.WithTimeout(context.Background(), HTTPShutdownTimeout)
	defer cancel()
	return server.Shutdown(ctx)
}
