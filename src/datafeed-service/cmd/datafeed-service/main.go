// Command datafeed-service serves feed data from MongoDB over HTTP.
//
// Endpoints:
//
//	GET /{user}/{endpoint}?offset=&limit=           — paginated records (latest or pinned version)
//	GET /{user}/{endpoint}/version/{major}.{minor}  — paginated records of a specific version
//	GET /{user}/{endpoint}/{id}                     — single record by id_field value
//	GET /healthz                                    — liveness / MongoDB connectivity check
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/endpointer-platform/datafeed-service/internal/httpapi"
	"github.com/endpointer-platform/datafeed-service/internal/mongoclient"
)

func main() {
	cfg := mustLoadConfig()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	mongoClient, db, err := mongoclient.New(ctx, mongoclient.Config{
		URI: cfg.mongoURI,
		DB:  cfg.mongoDB,
	})
	if err != nil {
		slog.Error("failed to connect to MongoDB", "error", err)
		os.Exit(1)
	}
	defer mongoClient.Disconnect(ctx) //nolint:errcheck

	h := &httpapi.Handler{
		Endpoints: db.Collection("endpoints"),
		Datafeeds: db.Collection("datafeeds"),
		Versions:  db.Collection("versions"),
		DB:        db,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", h.Healthz)
	mux.HandleFunc("GET /{user_name}/{endpoint_name}", h.GetAll)
	mux.HandleFunc("GET /{user_name}/{endpoint_name}/version/{version}", h.GetAll)
	mux.HandleFunc("GET /{user_name}/{endpoint_name}/{id}", h.GetByID)

	// Wrap with recovery (innermost) then logging (outermost).
	var handler http.Handler = mux
	handler = httpapi.RecoveryMiddleware(handler)
	handler = httpapi.LoggingMiddleware(handler)

	srv := &http.Server{
		Addr:    ":" + cfg.port,
		Handler: handler,
	}

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)
	go func() {
		sig := <-sigCh
		slog.Info("received signal, shutting down", "signal", sig)
		if err := srv.Shutdown(context.Background()); err != nil {
			slog.Error("http server shutdown error", "error", err)
		}
	}()

	slog.Info("datafeed-service listening",
		"addr", srv.Addr,
		"mongo_db", cfg.mongoDB,
	)

	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("http server error", "error", err)
		os.Exit(1)
	}

	slog.Info("datafeed-service stopped cleanly")
}

type config struct {
	port     string
	mongoURI string
	mongoDB  string
}

func mustLoadConfig() config {
	return config{
		port:     getEnvOrDefault("PORT", "8080"),
		mongoURI: mustEnv("MONGODB_URI"),
		mongoDB:  mustEnv("MONGODB_DB"),
	}
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		slog.Error("required env var not set", "key", key)
		os.Exit(1)
	}
	return v
}

func getEnvOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
