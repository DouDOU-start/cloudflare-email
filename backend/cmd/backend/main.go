package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	adminapi "github.com/cf-email/backend/internal/api/admin"
	viewerapi "github.com/cf-email/backend/internal/api/viewer"
	"github.com/cf-email/backend/internal/config"
	"github.com/cf-email/backend/internal/db"
	"github.com/cf-email/backend/internal/ingest"
	"github.com/cf-email/backend/internal/storage"
	"github.com/cf-email/backend/internal/web"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		logger.Error("config load failed", "err", err)
		os.Exit(1)
	}

	rootCtx, rootCancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer rootCancel()

	conn, queries, err := db.Open(rootCtx, cfg.DBPath)
	if err != nil {
		logger.Error("db open failed", "err", err)
		os.Exit(1)
	}
	defer conn.Close()
	logger.Info("db ready", "path", cfg.DBPath)

	cfgStore := config.NewStore(cfg)

	store, err := storage.NewFS(cfg.StorageDir)
	if err != nil {
		logger.Error("storage init failed", "err", err)
		os.Exit(1)
	}

	ingestHandler := &ingest.Handler{
		Config:  cfgStore,
		Queries: queries,
		DB:      conn,
		Storage: store,
		Logger:  logger,
	}

	adminServer := &adminapi.Server{
		Queries:        queries,
		DB:             conn,
		Storage:        store,
		Config:         cfgStore,
		Logger:         logger,
		PublicBaseURL:  cfg.PublicBaseURL,
		TurnstileKey:   cfg.TurnstileSecret,
		TurnstileSite:  cfg.TurnstileSite,
		CookieInsecure: os.Getenv("DEV_INSECURE_COOKIE") == "1",
	}

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	r.Post("/ingest/email", ingestHandler.ServeHTTP)
	r.Mount("/api/admin", adminServer.Routes())

	viewerServer := &viewerapi.Server{
		Queries: queries,
		Storage: store,
		Logger:  logger,
	}
	r.Mount("/api/v", viewerServer.Routes())

	// SPA + static assets (must be last so API routes take precedence)
	r.Mount("/", web.Handler())

	srv := &http.Server{
		Addr:              cfg.BindAddr,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		logger.Info("backend starting", "addr", cfg.BindAddr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("backend error", "err", err)
			rootCancel()
		}
	}()

	<-rootCtx.Done()
	logger.Info("shutting down")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("shutdown error", "err", err)
	}
}
