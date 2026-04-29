package admin

import (
	"database/sql"
	"log/slog"
	"net/http"

	"github.com/cf-email/backend/internal/config"
	"github.com/cf-email/backend/internal/db/gen"
	"github.com/cf-email/backend/internal/storage"
	"github.com/go-chi/chi/v5"
)

// Server bundles everything the admin handlers need.
type Server struct {
	Queries        *gen.Queries
	DB             *sql.DB
	Storage        storage.Store
	Config         *config.Store
	Logger         *slog.Logger
	TurnstileKey   string // optional
	TurnstileSite  string // optional
	CookieInsecure bool   // true only in local dev over HTTP
}

// configuredAdminID is the synthetic admin id used in session cookies. With
// the YAML-config admin model there is no DB row to reference, but session
// cookies still encode an int — we just always use 1.
const configuredAdminID int64 = 1

func (s *Server) secureCookie(r *http.Request) bool {
	if s.CookieInsecure {
		return false
	}
	return requestScheme(r) == "https"
}

func requestScheme(r *http.Request) string {
	scheme := forwardedValue(r.Header.Get("X-Forwarded-Proto"))
	if scheme == "" {
		scheme = forwardedParam(r.Header.Get("Forwarded"), "proto")
	}
	if scheme == "http" || scheme == "https" {
		return scheme
	}
	if r.TLS != nil {
		return "https"
	}
	return "http"
}

// Routes returns a chi router mounted under /api/admin.
func (s *Server) Routes() http.Handler {
	r := chi.NewRouter()

	// Public (no session required)
	r.Post("/login", s.handleLogin)
	r.Post("/logout", s.handleLogout)
	r.Get("/context", s.handleContext) // surface Turnstile config etc.

	// Authenticated
	r.Group(func(r chi.Router) {
		r.Use(s.RequireSession)
		r.Get("/me", s.handleMe)
		r.Get("/system-config", s.handleGetSystemConfig)
		r.Patch("/system-config", s.handleUpdateSystemConfig)

		r.Get("/mailboxes", s.handleListMailboxes)
		r.Post("/mailboxes", s.handleCreateMailbox)
		r.Patch("/mailboxes/{id}", s.handleUpdateMailbox)
		r.Delete("/mailboxes/{id}", s.handleDeleteMailbox)
		r.Get("/mailboxes/{id}/messages", s.handleListMailboxMessages)

		r.Get("/messages", s.handleListMessages)
		r.Get("/messages/{id}", s.handleGetMessage)
		r.Get("/messages/{id}/eml", s.handleDownloadMessageEML)
		r.Post("/messages/{id}/read", s.handleMarkRead)
		r.Delete("/messages/{id}", s.handleDeleteMessage)
		r.Get("/attachments/{id}", s.handleDownloadAttachment)

		r.Get("/tokens", s.handleListTokens)
		r.Post("/tokens", s.handleCreateToken)
		r.Get("/tokens/{id}", s.handleGetToken)
		r.Post("/tokens/{id}/reset", s.handleResetToken)
		r.Post("/tokens/{id}/revoke", s.handleRevokeToken)
		r.Delete("/tokens/{id}", s.handleDeleteToken)
	})

	return r
}
