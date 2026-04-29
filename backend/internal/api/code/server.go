package code

import (
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/cf-email/backend/internal/config"
	"github.com/cf-email/backend/internal/db/gen"
	"github.com/cf-email/backend/internal/httpapi"
	mimex "github.com/cf-email/backend/internal/mime"
	"github.com/cf-email/backend/internal/ratelimit"
	"github.com/go-chi/chi/v5"
)

const (
	apiRateLimitPerMin  = 60
	apiFailBanThreshold = 20
	apiFailBanMinutes   = 5
	candidateLimit      = 50
)

type Server struct {
	Queries *gen.Queries
	Config  *config.Store
	Logger  *slog.Logger

	rateWin  *ratelimit.SlidingWindow
	ban      *ratelimit.Ban
	initOnce bool
}

type emailCodeRequest struct {
	Platform     string `json:"platform"`
	Recipient    string `json:"recipient"`
	SenderSuffix string `json:"sender_suffix"`
	MarkRead     *bool  `json:"mark_read,omitempty"`
}

func (s *Server) Routes() http.Handler {
	s.ensureLimiters()
	r := chi.NewRouter()
	r.With(s.requireAPIKey).Post("/email", s.handleEmailCode)
	return r
}

func (s *Server) ensureLimiters() {
	if s.initOnce {
		return
	}
	s.rateWin = ratelimit.NewSlidingWindow(time.Minute, apiRateLimitPerMin)
	s.ban = ratelimit.NewBan(time.Minute, apiFailBanThreshold, time.Duration(apiFailBanMinutes)*time.Minute)
	s.initOnce = true
}

func (s *Server) requireAPIKey(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := httpapi.ClientIP(r)
		if banned, retry := s.ban.Check(ip); banned {
			w.Header().Set("Retry-After", strconv.Itoa(retry))
			httpapi.WriteJSON(w, http.StatusTooManyRequests, httpapi.Error{Error: "rate limited"})
			return
		}
		if !s.rateWin.Allow(ip) {
			httpapi.WriteJSON(w, http.StatusTooManyRequests, httpapi.Error{Error: "rate limited"})
			return
		}

		cfg := s.Config.Snapshot()
		if strings.TrimSpace(cfg.AdminAPIKey) == "" {
			httpapi.WriteJSON(w, http.StatusServiceUnavailable, httpapi.Error{Error: "email code api is not enabled"})
			return
		}

		raw := bearerToken(r.Header.Get("Authorization"))
		if !config.VerifyAdminAPIKey(cfg.AdminAPIKey, raw) {
			s.ban.Fail(ip)
			httpapi.WriteJSON(w, http.StatusUnauthorized, httpapi.Error{Error: "unauthorized"})
			return
		}

		s.ban.Success(ip)
		next.ServeHTTP(w, r)
	})
}

func (s *Server) handleEmailCode(w http.ResponseWriter, r *http.Request) {
	var req emailCodeRequest
	if err := httpapi.DecodeJSON(r, &req); err != nil {
		httpapi.WriteJSON(w, http.StatusBadRequest, httpapi.Error{Error: "invalid body"})
		return
	}

	platform := normalizePlatform(req.Platform)
	if !isValidPlatform(platform) {
		httpapi.WriteJSON(w, http.StatusBadRequest, httpapi.Error{Error: "invalid platform"})
		return
	}

	recipient := normalizeEmail(req.Recipient)
	if !isValidEmail(recipient) {
		httpapi.WriteJSON(w, http.StatusBadRequest, httpapi.Error{Error: "invalid recipient"})
		return
	}
	senderSuffix := normalizeSenderSuffix(req.SenderSuffix)
	if !isValidSenderSuffix(senderSuffix) {
		httpapi.WriteJSON(w, http.StatusBadRequest, httpapi.Error{Error: "invalid sender_suffix"})
		return
	}

	rows, err := s.Queries.FindLatestUnreadMessagesForCode(r.Context(), gen.FindLatestUnreadMessagesForCodeParams{
		ToAddr:   "%" + recipient + "%",
		FromAddr: "%" + senderSuffix + "%",
		Limit:    candidateLimit,
	})
	if err != nil {
		httpapi.WriteJSON(w, http.StatusInternalServerError, httpapi.Error{Error: "internal error"})
		return
	}

	for _, m := range rows {
		to := mimex.ExtractAddress(m.ToAddr)
		from := mimex.ExtractAddress(m.FromAddr)
		if to != recipient || !senderDomainMatches(from, senderSuffix) {
			continue
		}

		code, ok := ExtractVerificationCode(platform, m.Subject.String, m.TextBody.String, m.HtmlBody.String)
		if !ok {
			continue
		}

		markRead := true
		if req.MarkRead != nil {
			markRead = *req.MarkRead
		}
		if markRead {
			if err := s.Queries.MarkMessageRead(r.Context(), m.ID); err != nil {
				httpapi.WriteJSON(w, http.StatusInternalServerError, httpapi.Error{Error: "internal error"})
				return
			}
		}

		httpapi.WriteJSON(w, http.StatusOK, map[string]any{
			"code":        code,
			"message_id":  m.ID,
			"from":        m.FromAddr,
			"to":          m.ToAddr,
			"subject":     m.Subject.String,
			"received_at": m.ReceivedAt,
		})
		return
	}

	httpapi.WriteJSON(w, http.StatusNotFound, httpapi.Error{Error: "code not found"})
}

func bearerToken(header string) string {
	prefix := "Bearer "
	if len(header) <= len(prefix) || !strings.EqualFold(header[:len(prefix)], prefix) {
		return ""
	}
	return strings.TrimSpace(header[len(prefix):])
}

func normalizePlatform(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func isValidPlatform(value string) bool {
	return value == "openai"
}

func normalizeEmail(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func isValidEmail(value string) bool {
	if value == "" || strings.ContainsAny(value, " <>\t\r\n,") {
		return false
	}
	at := strings.LastIndex(value, "@")
	return at > 0 && at < len(value)-1 && strings.Contains(value[at+1:], ".")
}

func normalizeSenderSuffix(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.TrimPrefix(value, "@")
	return strings.Trim(value, ".")
}

func isValidSenderSuffix(value string) bool {
	if value == "" || len(value) > 253 || !strings.Contains(value, ".") {
		return false
	}
	return !strings.ContainsAny(value, " @,;:*%\t\r\n")
}

func senderDomainMatches(from string, suffix string) bool {
	domain := mimex.Domain(from)
	return domain == suffix || strings.HasSuffix(domain, "."+suffix)
}
