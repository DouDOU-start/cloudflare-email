package admin

import (
	"context"
	"crypto/subtle"
	"database/sql"
	"net/http"
	"strings"
	"time"

	"github.com/cf-email/backend/internal/auth"
	"github.com/cf-email/backend/internal/db/gen"
	"github.com/cf-email/backend/internal/httpapi"
)

// Login throttle / session policy. Constants because they're not user-tunable.
const (
	loginFailWindowMin = 15
	loginFailThreshold = 5
	loginBanMinutes    = 30
	sessionTTLHours    = 168 // 7 days
)

type loginReq struct {
	Username       string `json:"username"`
	Password       string `json:"password"`
	TurnstileToken string `json:"turnstile_token,omitempty"`
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginReq
	if err := httpapi.DecodeJSON(r, &req); err != nil {
		httpapi.WriteJSON(w, http.StatusBadRequest, httpapi.Error{Error: "invalid body"})
		return
	}
	req.Username = strings.TrimSpace(req.Username)

	ctx := r.Context()
	ip := httpapi.ClientIP(r)

	// Rate limit: count failures from this IP within the rolling window.
	since := time.Now().Add(-time.Duration(loginFailWindowMin) * time.Minute).Unix()
	fails, err := s.Queries.CountRecentLoginFailures(ctx, gen.CountRecentLoginFailuresParams{
		Ip:          ip,
		AttemptedAt: since,
	})
	if err != nil {
		s.Logger.Error("count login failures", "err", err)
		httpapi.WriteJSON(w, http.StatusInternalServerError, httpapi.Error{Error: "internal error"})
		return
	}
	if fails >= loginFailThreshold {
		bannedSince := time.Now().Add(-time.Duration(loginBanMinutes) * time.Minute).Unix()
		recentFails, _ := s.Queries.CountRecentLoginFailures(ctx, gen.CountRecentLoginFailuresParams{
			Ip:          ip,
			AttemptedAt: bannedSince,
		})
		if recentFails >= loginFailThreshold {
			httpapi.WriteJSON(w, http.StatusTooManyRequests, httpapi.Error{Error: "too many attempts, try again later"})
			return
		}
	}

	// Turnstile is required iff turnstile is configured at all.
	turnstileRequired := s.TurnstileKey != "" && s.TurnstileSite != ""
	if turnstileRequired {
		if !s.verifyTurnstile(req.TurnstileToken, ip) {
			s.recordAttempt(ctx, ip, req.Username, false)
			httpapi.WriteJSON(w, http.StatusUnauthorized, httpapi.Error{Error: "captcha failed"})
			return
		}
	}

	cfg := s.Config.Snapshot()
	userOK := subtle.ConstantTimeCompare([]byte(req.Username), []byte(cfg.AdminUsername)) == 1
	passOK := subtle.ConstantTimeCompare([]byte(req.Password), []byte(cfg.AdminPassword)) == 1
	if !userOK || !passOK {
		s.recordAttempt(ctx, ip, req.Username, false)
		httpapi.WriteJSON(w, http.StatusUnauthorized, httpapi.Error{Error: "用户名或密码错误"})
		return
	}

	s.recordAttempt(ctx, ip, req.Username, true)

	ttl := time.Duration(sessionTTLHours) * time.Hour
	cookie, exp := auth.IssueSession(cfg.SessionSecret, configuredAdminID, ttl)
	auth.SetSessionCookie(w, cookie, exp, s.secureCookie())

	httpapi.WriteJSON(w, http.StatusOK, map[string]any{
		"username":  cfg.AdminUsername,
		"expiresAt": exp.Unix(),
	})
}

func (s *Server) handleLogout(w http.ResponseWriter, _ *http.Request) {
	auth.ClearSessionCookie(w, s.secureCookie())
	httpapi.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleContext(w http.ResponseWriter, _ *http.Request) {
	turnstileRequired := s.TurnstileKey != "" && s.TurnstileSite != ""
	httpapi.WriteJSON(w, http.StatusOK, map[string]any{
		"turnstile_required": turnstileRequired,
		"turnstile_site_key": s.TurnstileSite,
	})
}

func (s *Server) handleMe(w http.ResponseWriter, _ *http.Request) {
	cfg := s.Config.Snapshot()
	httpapi.WriteJSON(w, http.StatusOK, map[string]any{
		"username": cfg.AdminUsername,
	})
}

func (s *Server) recordAttempt(ctx context.Context, ip, username string, success bool) {
	_ = s.Queries.RecordLoginAttempt(ctx, gen.RecordLoginAttemptParams{
		Ip:          ip,
		Username:    sql.NullString{String: username, Valid: username != ""},
		Success:     boolToInt(success),
		AttemptedAt: time.Now().Unix(),
	})
}

func boolToInt(b bool) int64 {
	if b {
		return 1
	}
	return 0
}
