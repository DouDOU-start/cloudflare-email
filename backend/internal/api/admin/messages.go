package admin

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strings"

	"github.com/cf-email/backend/internal/db/gen"
	"github.com/cf-email/backend/internal/eml"
	"github.com/cf-email/backend/internal/httpapi"
)

type messageListItem struct {
	ID         int64  `json:"id"`
	MailboxID  int64  `json:"mailbox_id"`
	MessageID  string `json:"message_id"`
	FromAddr   string `json:"from_addr"`
	ToAddr     string `json:"to_addr"`
	Subject    string `json:"subject"`
	ReceivedAt int64  `json:"received_at"`
	Size       int64  `json:"size"`
	IsRead     bool   `json:"is_read"`
}

type messageDetail struct {
	messageListItem
	TextBody    string           `json:"text_body"`
	HTMLBody    string           `json:"html_body"`
	HasRaw      bool             `json:"has_raw"`
	Attachments []attachmentView `json:"attachments"`
}

type attachmentView struct {
	ID          int64  `json:"id"`
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	Size        int64  `json:"size"`
}

func (s *Server) handleListMessages(w http.ResponseWriter, r *http.Request) {
	limit, offset := httpapi.ParsePage(r)
	params := messageSearchParams(r, limit, offset)

	rows, err := s.Queries.ListMessages(r.Context(), params)
	if err != nil {
		httpapi.WriteJSON(w, http.StatusInternalServerError, httpapi.Error{Error: "internal error"})
		return
	}

	var total int64
	out := make([]messageListItem, 0, len(rows))
	for _, m := range rows {
		total = m.TotalCount
		out = append(out, messageListItem{
			ID:         m.ID,
			MailboxID:  m.MailboxID,
			MessageID:  m.MessageID.String,
			FromAddr:   m.FromAddr,
			ToAddr:     m.ToAddr,
			Subject:    m.Subject.String,
			ReceivedAt: m.ReceivedAt,
			Size:       m.Size,
			IsRead:     m.IsRead == 1,
		})
	}
	httpapi.WriteJSON(w, http.StatusOK, map[string]any{"items": out, "total": total})
}

func messageSearchParams(r *http.Request, limit, offset int64) gen.ListMessagesParams {
	search := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
	pattern := "%" + search + "%"
	status := r.URL.Query().Get("status")
	if status != "unread" && status != "read" {
		status = "all"
	}
	return gen.ListMessagesParams{
		Column1:  search,
		FromAddr: pattern,
		ToAddr:   pattern,
		Subject:  sql.NullString{String: pattern, Valid: true},
		Address:  pattern,
		Note:     sql.NullString{String: pattern, Valid: true},
		Column7:  status,
		Column8:  status,
		Column9:  status,
		Limit:    limit,
		Offset:   offset,
	}
}

func (s *Server) handleListMailboxMessages(w http.ResponseWriter, r *http.Request) {
	mailboxID, err := httpapi.PathInt64(r, "id")
	if err != nil {
		httpapi.WriteJSON(w, http.StatusBadRequest, httpapi.Error{Error: "bad id"})
		return
	}
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

	var total int64
	out := make([]messageListItem, 0, len(rows))
	for _, m := range rows {
		total = m.TotalCount
		out = append(out, messageListItem{
			ID:         m.ID,
			MailboxID:  m.MailboxID,
			MessageID:  m.MessageID.String,
			FromAddr:   m.FromAddr,
			ToAddr:     m.ToAddr,
			Subject:    m.Subject.String,
			ReceivedAt: m.ReceivedAt,
			Size:       m.Size,
			IsRead:     m.IsRead == 1,
		})
	}
	httpapi.WriteJSON(w, http.StatusOK, map[string]any{"items": out, "total": total})
}

func (s *Server) handleGetMessage(w http.ResponseWriter, r *http.Request) {
	id, err := httpapi.PathInt64(r, "id")
	if err != nil {
		httpapi.WriteJSON(w, http.StatusBadRequest, httpapi.Error{Error: "bad id"})
		return
	}
	m, err := s.Queries.GetMessageByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpapi.WriteJSON(w, http.StatusNotFound, httpapi.Error{Error: "not found"})
			return
		}
		httpapi.WriteJSON(w, http.StatusInternalServerError, httpapi.Error{Error: "internal error"})
		return
	}
	atts, _ := s.Queries.ListAttachmentsByMessage(r.Context(), id)
	attViews := make([]attachmentView, 0, len(atts))
	for _, a := range atts {
		attViews = append(attViews, attachmentView{
			ID:          a.ID,
			Filename:    a.Filename,
			ContentType: a.ContentType.String,
			Size:        a.Size,
		})
	}
	httpapi.WriteJSON(w, http.StatusOK, messageDetail{
		messageListItem: messageListItem{
			ID:         m.ID,
			MailboxID:  m.MailboxID,
			MessageID:  m.MessageID.String,
			FromAddr:   m.FromAddr,
			ToAddr:     m.ToAddr,
			Subject:    m.Subject.String,
			ReceivedAt: m.ReceivedAt,
			Size:       m.Size,
			IsRead:     m.IsRead == 1,
		},
		TextBody:    m.TextBody.String,
		HTMLBody:    m.HtmlBody.String,
		HasRaw:      m.RawStoragePath.Valid && m.RawStoragePath.String != "",
		Attachments: attViews,
	})
}

func (s *Server) handleMarkRead(w http.ResponseWriter, r *http.Request) {
	id, err := httpapi.PathInt64(r, "id")
	if err != nil {
		httpapi.WriteJSON(w, http.StatusBadRequest, httpapi.Error{Error: "bad id"})
		return
	}
	if err := s.Queries.MarkMessageRead(r.Context(), id); err != nil {
		httpapi.WriteJSON(w, http.StatusInternalServerError, httpapi.Error{Error: "internal error"})
		return
	}
	httpapi.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleMarkAllRead(w http.ResponseWriter, r *http.Request) {
	if err := s.Queries.MarkAllMessagesRead(r.Context()); err != nil {
		httpapi.WriteJSON(w, http.StatusInternalServerError, httpapi.Error{Error: "internal error"})
		return
	}
	httpapi.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleMarkMailboxRead(w http.ResponseWriter, r *http.Request) {
	id, err := httpapi.PathInt64(r, "id")
	if err != nil {
		httpapi.WriteJSON(w, http.StatusBadRequest, httpapi.Error{Error: "bad id"})
		return
	}
	if err := s.Queries.MarkMailboxMessagesRead(r.Context(), id); err != nil {
		httpapi.WriteJSON(w, http.StatusInternalServerError, httpapi.Error{Error: "internal error"})
		return
	}
	httpapi.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleDeleteMessage(w http.ResponseWriter, r *http.Request) {
	id, err := httpapi.PathInt64(r, "id")
	if err != nil {
		httpapi.WriteJSON(w, http.StatusBadRequest, httpapi.Error{Error: "bad id"})
		return
	}
	s.purgeMessageFiles(r.Context(), id)
	if err := s.Queries.DeleteMessage(r.Context(), id); err != nil {
		httpapi.WriteJSON(w, http.StatusInternalServerError, httpapi.Error{Error: "internal error"})
		return
	}
	httpapi.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleDownloadAttachment(w http.ResponseWriter, r *http.Request) {
	id, err := httpapi.PathInt64(r, "id")
	if err != nil {
		httpapi.WriteJSON(w, http.StatusBadRequest, httpapi.Error{Error: "bad id"})
		return
	}
	a, err := s.Queries.GetAttachmentByID(r.Context(), id)
	if err != nil {
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

func (s *Server) handleDownloadMessageEML(w http.ResponseWriter, r *http.Request) {
	id, err := httpapi.PathInt64(r, "id")
	if err != nil {
		httpapi.WriteJSON(w, http.StatusBadRequest, httpapi.Error{Error: "bad id"})
		return
	}
	m, err := s.Queries.GetMessageByID(r.Context(), id)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	if err := eml.ServeMessage(r.Context(), w, s.Queries, s.Storage, m); err != nil {
		http.NotFound(w, r)
	}
}

// purgeMessageFiles best-effort removes attachments and raw message content for a message.
func (s *Server) purgeMessageFiles(ctx context.Context, messageID int64) {
	m, err := s.Queries.GetMessageByID(ctx, messageID)
	if err == nil && m.RawStoragePath.Valid && m.RawStoragePath.String != "" {
		_ = s.Storage.Delete(m.RawStoragePath.String)
	}
	atts, _ := s.Queries.ListAttachmentsByMessage(ctx, messageID)
	for _, a := range atts {
		_ = s.Storage.Delete(a.StoragePath)
	}
}
