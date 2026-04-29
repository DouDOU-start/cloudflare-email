package admin

import (
	"context"
	"net/http"

	"github.com/cf-email/backend/internal/auth"
	"github.com/cf-email/backend/internal/httpapi"
)

type ctxKey int

const adminCtxKey ctxKey = iota

// RequireSession enforces a valid signed session cookie.
func (s *Server) RequireSession(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(auth.SessionCookieName)
		if err != nil {
			httpapi.WriteJSON(w, http.StatusUnauthorized, httpapi.Error{Error: "unauthorized"})
			return
		}
		cfg := s.Config.Snapshot()
		sess, err := auth.VerifySession(cfg.SessionSecret, cookie.Value)
		if err != nil {
			auth.ClearSessionCookie(w, s.secureCookie())
			httpapi.WriteJSON(w, http.StatusUnauthorized, httpapi.Error{Error: "unauthorized"})
			return
		}
		ctx := context.WithValue(r.Context(), adminCtxKey, sess.AdminID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// AdminIDFromContext returns the admin_id attached by RequireSession (or 0).
func AdminIDFromContext(ctx context.Context) int64 {
	v, _ := ctx.Value(adminCtxKey).(int64)
	return v
}
