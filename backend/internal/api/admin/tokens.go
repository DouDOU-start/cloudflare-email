package admin

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/cf-email/backend/internal/db/gen"
	"github.com/cf-email/backend/internal/httpapi"
)

const defaultTokenTTLDays = 30

type tokenView struct {
	ID             int64   `json:"id"`
	MailboxID      int64   `json:"mailbox_id"`
	MailboxAddress string  `json:"mailbox_address"`
	Name           string  `json:"name"`
	CreatedAt      int64   `json:"created_at"`
	ExpiresAt      *int64  `json:"expires_at"`
	RevokedAt      *int64  `json:"revoked_at"`
	LastUsedAt     *int64  `json:"last_used_at"`
	URL            *string `json:"url,omitempty"`
}

type createTokenReq struct {
	MailboxID int64  `json:"mailbox_id"`
	Name      string `json:"name,omitempty"`
	TTLDays   *int64 `json:"ttl_days,omitempty"` // nil = use default; 0 = no expiry
}

func (s *Server) handleListTokens(w http.ResponseWriter, r *http.Request) {
	rows, err := s.Queries.ListAllTokens(r.Context())
	if err != nil {
		httpapi.WriteJSON(w, http.StatusInternalServerError, httpapi.Error{Error: "internal error"})
		return
	}
	out := make([]tokenView, 0, len(rows))
	for _, t := range rows {
		out = append(out, tokenView{
			ID:             t.ID,
			MailboxID:      t.MailboxID,
			MailboxAddress: t.MailboxAddress,
			Name:           t.Name.String,
			CreatedAt:      t.CreatedAt,
			ExpiresAt:      nullInt(t.ExpiresAt),
			RevokedAt:      nullInt(t.RevokedAt),
			LastUsedAt:     nullInt(t.LastUsedAt),
		})
	}
	httpapi.WriteJSON(w, http.StatusOK, out)
}

func (s *Server) handleGetToken(w http.ResponseWriter, r *http.Request) {
	id, err := httpapi.PathInt64(r, "id")
	if err != nil {
		httpapi.WriteJSON(w, http.StatusBadRequest, httpapi.Error{Error: "bad id"})
		return
	}

	tok, err := s.Queries.GetTokenWithMailbox(r.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpapi.WriteJSON(w, http.StatusNotFound, httpapi.Error{Error: "not found"})
			return
		}
		httpapi.WriteJSON(w, http.StatusInternalServerError, httpapi.Error{Error: "internal error"})
		return
	}

	view := tokenView{
		ID:             tok.ID,
		MailboxID:      tok.MailboxID,
		MailboxAddress: tok.MailboxAddress,
		Name:           tok.Name.String,
		CreatedAt:      tok.CreatedAt,
		ExpiresAt:      nullInt(tok.ExpiresAt),
		RevokedAt:      nullInt(tok.RevokedAt),
		LastUsedAt:     nullInt(tok.LastUsedAt),
	}
	if tok.PlainToken.Valid && tok.PlainToken.String != "" {
		url := s.tokenURL(r, tok.PlainToken.String)
		view.URL = &url
	}
	httpapi.WriteJSON(w, http.StatusOK, view)
}

func (s *Server) handleCreateToken(w http.ResponseWriter, r *http.Request) {
	var req createTokenReq
	if err := httpapi.DecodeJSON(r, &req); err != nil {
		httpapi.WriteJSON(w, http.StatusBadRequest, httpapi.Error{Error: "invalid body"})
		return
	}
	if req.MailboxID == 0 {
		httpapi.WriteJSON(w, http.StatusBadRequest, httpapi.Error{Error: "mailbox_id required"})
		return
	}

	var expiresAt sql.NullInt64
	switch {
	case req.TTLDays == nil:
		expiresAt = sql.NullInt64{Int64: time.Now().Add(defaultTokenTTLDays * 24 * time.Hour).Unix(), Valid: true}
	case *req.TTLDays <= 0:
		expiresAt = sql.NullInt64{}
	default:
		expiresAt = sql.NullInt64{Int64: time.Now().Add(time.Duration(*req.TTLDays) * 24 * time.Hour).Unix(), Valid: true}
	}

	plain, sum, err := generateTokenSecret()
	if err != nil {
		httpapi.WriteJSON(w, http.StatusInternalServerError, httpapi.Error{Error: "internal error"})
		return
	}

	tok, err := s.Queries.CreateToken(r.Context(), gen.CreateTokenParams{
		MailboxID:  req.MailboxID,
		TokenHash:  sum,
		PlainToken: sql.NullString{String: plain, Valid: true},
		Name:       sql.NullString{String: req.Name, Valid: req.Name != ""},
		ExpiresAt:  expiresAt,
		CreatedAt:  time.Now().Unix(),
	})
	if err != nil {
		httpapi.WriteJSON(w, http.StatusInternalServerError, httpapi.Error{Error: "internal error"})
		return
	}

	mb, _ := s.Queries.GetMailboxByID(r.Context(), req.MailboxID)
	url := s.tokenURL(r, plain)
	httpapi.WriteJSON(w, http.StatusOK, tokenView{
		ID:             tok.ID,
		MailboxID:      tok.MailboxID,
		MailboxAddress: mb.Address,
		Name:           tok.Name.String,
		CreatedAt:      tok.CreatedAt,
		ExpiresAt:      nullInt(tok.ExpiresAt),
		URL:            &url,
	})
}

func (s *Server) handleResetToken(w http.ResponseWriter, r *http.Request) {
	id, err := httpapi.PathInt64(r, "id")
	if err != nil {
		httpapi.WriteJSON(w, http.StatusBadRequest, httpapi.Error{Error: "bad id"})
		return
	}

	existing, err := s.Queries.GetTokenWithMailbox(r.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpapi.WriteJSON(w, http.StatusNotFound, httpapi.Error{Error: "not found"})
			return
		}
		httpapi.WriteJSON(w, http.StatusInternalServerError, httpapi.Error{Error: "internal error"})
		return
	}

	plain, sum, err := generateTokenSecret()
	if err != nil {
		httpapi.WriteJSON(w, http.StatusInternalServerError, httpapi.Error{Error: "internal error"})
		return
	}

	tok, err := s.Queries.ResetTokenSecret(r.Context(), gen.ResetTokenSecretParams{
		TokenHash:  sum,
		PlainToken: sql.NullString{String: plain, Valid: true},
		ID:         id,
	})
	if err != nil {
		httpapi.WriteJSON(w, http.StatusInternalServerError, httpapi.Error{Error: "internal error"})
		return
	}

	url := s.tokenURL(r, plain)
	httpapi.WriteJSON(w, http.StatusOK, tokenView{
		ID:             tok.ID,
		MailboxID:      tok.MailboxID,
		MailboxAddress: existing.MailboxAddress,
		Name:           tok.Name.String,
		CreatedAt:      tok.CreatedAt,
		ExpiresAt:      nullInt(tok.ExpiresAt),
		RevokedAt:      nullInt(tok.RevokedAt),
		LastUsedAt:     nullInt(tok.LastUsedAt),
		URL:            &url,
	})
}

func (s *Server) handleRevokeToken(w http.ResponseWriter, r *http.Request) {
	id, err := httpapi.PathInt64(r, "id")
	if err != nil {
		httpapi.WriteJSON(w, http.StatusBadRequest, httpapi.Error{Error: "bad id"})
		return
	}
	if err := s.Queries.RevokeToken(r.Context(), gen.RevokeTokenParams{
		RevokedAt: sql.NullInt64{Int64: time.Now().Unix(), Valid: true},
		ID:        id,
	}); err != nil {
		httpapi.WriteJSON(w, http.StatusInternalServerError, httpapi.Error{Error: "internal error"})
		return
	}
	httpapi.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleDeleteToken(w http.ResponseWriter, r *http.Request) {
	id, err := httpapi.PathInt64(r, "id")
	if err != nil {
		httpapi.WriteJSON(w, http.StatusBadRequest, httpapi.Error{Error: "bad id"})
		return
	}
	if err := s.Queries.DeleteToken(r.Context(), id); err != nil {
		httpapi.WriteJSON(w, http.StatusInternalServerError, httpapi.Error{Error: "internal error"})
		return
	}
	httpapi.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func generateTokenSecret() (string, []byte, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", nil, err
	}
	plain := base64.RawURLEncoding.EncodeToString(raw)
	sum := sha256.Sum256([]byte(plain))
	return plain, sum[:], nil
}

func (s *Server) tokenURL(r *http.Request, plain string) string {
	return requestBaseURL(r) + "/v/" + plain
}

func requestBaseURL(r *http.Request) string {
	host := forwardedValue(r.Header.Get("X-Forwarded-Host"))
	if host == "" {
		host = forwardedParam(r.Header.Get("Forwarded"), "host")
	}
	if host == "" {
		host = r.Host
	}
	if host == "" {
		return ""
	}

	scheme := forwardedValue(r.Header.Get("X-Forwarded-Proto"))
	if scheme == "" {
		scheme = forwardedParam(r.Header.Get("Forwarded"), "proto")
	}
	if scheme != "http" && scheme != "https" {
		if r.TLS != nil {
			scheme = "https"
		} else {
			scheme = "http"
		}
	}

	return scheme + "://" + host
}

func forwardedValue(value string) string {
	value, _, _ = strings.Cut(value, ",")
	return strings.Trim(strings.TrimSpace(value), `"`)
}

func forwardedParam(value, key string) string {
	value, _, _ = strings.Cut(value, ",")
	for _, part := range strings.Split(value, ";") {
		name, raw, ok := strings.Cut(strings.TrimSpace(part), "=")
		if ok && strings.EqualFold(name, key) {
			return strings.Trim(strings.TrimSpace(raw), `"`)
		}
	}
	return ""
}

func nullInt(n sql.NullInt64) *int64 {
	if !n.Valid {
		return nil
	}
	v := n.Int64
	return &v
}
