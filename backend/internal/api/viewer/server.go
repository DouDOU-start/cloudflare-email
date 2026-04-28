package viewer

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/cf-email/backend/internal/db/gen"
	"github.com/cf-email/backend/internal/httpapi"
	"github.com/cf-email/backend/internal/ratelimit"
	"github.com/cf-email/backend/internal/storage"
	"github.com/go-chi/chi/v5"
)

// Per-IP throttle for viewer endpoints. Bad-token attempts also trip a longer ban.
const (
	viewerRateLimitPerMin  = 60
	viewerFailBanThreshold = 20
	viewerFailBanMinutes   = 5
)

type Server struct {
	Queries *gen.Queries
	Storage storage.Store
	Logger  *slog.Logger

	rateWin  *ratelimit.SlidingWindow // per-IP request rate
	ban      *ratelimit.Ban           // per-IP bad-token ban
	initOnce bool
}

// Routes mounts public viewer API. Path layout: /api/v/{token}/...
func (s *Server) Routes() http.Handler {
	s.ensureLimiters()
	r := chi.NewRouter()
	r.With(s.tokenMiddleware).Get("/{token}/mailbox", s.handleMailbox)
	r.With(s.tokenMiddleware).Get("/{token}/messages", s.handleListMessages)
	r.With(s.tokenMiddleware).Get("/{token}/messages/{id}", s.handleGetMessage)
	r.With(s.tokenMiddleware).Get("/{token}/attachments/{id}", s.handleDownloadAttachment)
	return r
}

func (s *Server) ensureLimiters() {
	if s.initOnce {
		return
	}
	s.rateWin = ratelimit.NewSlidingWindow(time.Minute, viewerRateLimitPerMin)
	s.ban = ratelimit.NewBan(
		time.Minute,
		viewerFailBanThreshold,
		time.Duration(viewerFailBanMinutes)*time.Minute,
	)
	s.initOnce = true
}

type ctxKey int

const (
	ctxTokenID   ctxKey = iota // int64
	ctxMailboxID               // int64
)

func (s *Server) tokenMiddleware(next http.Handler) http.Handler {
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

		raw := chi.URLParam(r, "token")
		if raw == "" || len(raw) < 20 || len(raw) > 100 {
			s.ban.Fail(ip)
			httpapi.WriteJSON(w, http.StatusNotFound, httpapi.Error{Error: "not found"})
			return
		}
		sum := sha256.Sum256([]byte(raw))
		tok, err := s.Queries.GetTokenByHash(r.Context(), sum[:])
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				s.ban.Fail(ip)
			}
			httpapi.WriteJSON(w, http.StatusNotFound, httpapi.Error{Error: "not found"})
			return
		}
		// Expiry / revocation — all map to "not found" so existence isn't leaked.
		if tok.RevokedAt.Valid {
			httpapi.WriteJSON(w, http.StatusNotFound, httpapi.Error{Error: "not found"})
			return
		}
		if tok.ExpiresAt.Valid && time.Now().Unix() > tok.ExpiresAt.Int64 {
			httpapi.WriteJSON(w, http.StatusNotFound, httpapi.Error{Error: "not found"})
			return
		}
		// Constant-time re-verify to avoid any per-byte timing signal.
		if subtle.ConstantTimeCompare(sum[:], tok.TokenHash) != 1 {
			httpapi.WriteJSON(w, http.StatusNotFound, httpapi.Error{Error: "not found"})
			return
		}

		_ = s.Queries.TouchTokenUsed(r.Context(), gen.TouchTokenUsedParams{
			LastUsedAt: sql.NullInt64{Int64: time.Now().Unix(), Valid: true},
			ID:         tok.ID,
		})
		s.ban.Success(ip)

		ctx := context.WithValue(r.Context(), ctxTokenID, tok.ID)
		ctx = context.WithValue(ctx, ctxMailboxID, tok.MailboxID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Server) handleMailbox(w http.ResponseWriter, r *http.Request) {
	mailboxID := getCtxInt(r, ctxMailboxID)
	mb, err := s.Queries.GetMailboxByID(r.Context(), mailboxID)
	if err != nil {
		httpapi.WriteJSON(w, http.StatusInternalServerError, httpapi.Error{Error: "internal error"})
		return
	}
	unread, _ := s.Queries.CountUnreadByMailbox(r.Context(), mailboxID)
	total, _ := s.Queries.CountMessagesByMailbox(r.Context(), mailboxID)
	httpapi.WriteJSON(w, http.StatusOK, map[string]any{
		"address":       mb.Address,
		"created_at":    mb.CreatedAt,
		"message_count": total,
		"unread_count":  unread,
	})
}

func (s *Server) handleListMessages(w http.ResponseWriter, r *http.Request) {
	mailboxID := getCtxInt(r, ctxMailboxID)
	limit, offset := httpapi.ParsePage(r)
	rows, err := s.Queries.ListMessagesByMailbox(r.Context(), gen.ListMessagesByMailboxParams{
		MailboxID: mailboxID,
		Limit:     limit,
		Offset:    offset,
	})
	if err != nil {
		httpapi.WriteJSON(w, http.StatusInternalServerError, httpapi.Error{Error: "internal error"})
		return
	}
	total, _ := s.Queries.CountMessagesByMailbox(r.Context(), mailboxID)

	items := make([]map[string]any, 0, len(rows))
	for _, m := range rows {
		items = append(items, map[string]any{
			"id":          m.ID,
			"from_addr":   m.FromAddr,
			"to_addr":     m.ToAddr,
			"subject":     m.Subject.String,
			"received_at": m.ReceivedAt,
			"size":        m.Size,
			"is_read":     m.IsRead == 1,
		})
	}
	httpapi.WriteJSON(w, http.StatusOK, map[string]any{"items": items, "total": total})
}

func (s *Server) handleGetMessage(w http.ResponseWriter, r *http.Request) {
	mailboxID := getCtxInt(r, ctxMailboxID)
	id, err := httpapi.PathInt64(r, "id")
	if err != nil {
		httpapi.WriteJSON(w, http.StatusBadRequest, httpapi.Error{Error: "bad id"})
		return
	}
	m, err := s.Queries.GetMessageByID(r.Context(), id)
	if err != nil || m.MailboxID != mailboxID {
		httpapi.WriteJSON(w, http.StatusNotFound, httpapi.Error{Error: "not found"})
		return
	}
	_ = s.Queries.MarkMessageRead(r.Context(), id)
	atts, _ := s.Queries.ListAttachmentsByMessage(r.Context(), id)
	views := make([]map[string]any, 0, len(atts))
	for _, a := range atts {
		views = append(views, map[string]any{
			"id":           a.ID,
			"filename":     a.Filename,
			"content_type": a.ContentType.String,
			"size":         a.Size,
		})
	}
	httpapi.WriteJSON(w, http.StatusOK, map[string]any{
		"id":          m.ID,
		"from_addr":   m.FromAddr,
		"to_addr":     m.ToAddr,
		"subject":     m.Subject.String,
		"received_at": m.ReceivedAt,
		"size":        m.Size,
		"text_body":   m.TextBody.String,
		"html_body":   m.HtmlBody.String,
		"attachments": views,
	})
}

func (s *Server) handleDownloadAttachment(w http.ResponseWriter, r *http.Request) {
	mailboxID := getCtxInt(r, ctxMailboxID)
	id, err := httpapi.PathInt64(r, "id")
	if err != nil {
		http.NotFound(w, r)
		return
	}
	a, err := s.Queries.GetAttachmentByID(r.Context(), id)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	msg, err := s.Queries.GetMessageByID(r.Context(), a.MessageID)
	if err != nil || msg.MailboxID != mailboxID {
		http.NotFound(w, r)
		return
	}
	rc, err := s.Storage.Open(a.StoragePath)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer rc.Close()
	httpapi.ServeAttachment(w, a.Filename, a.ContentType.String, rc)
}

func getCtxInt(r *http.Request, k ctxKey) int64 {
	v, _ := r.Context().Value(k).(int64)
	return v
}
