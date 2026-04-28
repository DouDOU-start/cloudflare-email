package admin

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strings"

	"github.com/cf-email/backend/internal/db/gen"
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
	params, countParams := messageSearchParams(r, limit, offset)

	rows, err := s.Queries.ListMessages(r.Context(), params)
	if err != nil {
		httpapi.WriteJSON(w, http.StatusInternalServerError, httpapi.Error{Error: "internal error"})
		return
	}
	total, _ := s.Queries.CountMessages(r.Context(), countParams)

	out := make([]messageListItem, 0, len(rows))
	for _, m := range rows {
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

func messageSearchParams(r *http.Request, limit, offset int64) (gen.ListMessagesParams, gen.CountMessagesParams) {
	search := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
	pattern := "%" + search + "%"
	status := r.URL.Query().Get("status")
	if status != "unread" && status != "read" {
		status = "all"
	}
	count := gen.CountMessagesParams{
		Column1:  search,
		FromAddr: pattern,
		ToAddr:   pattern,
		Subject:  sql.NullString{String: pattern, Valid: true},
		Address:  pattern,
		Note:     sql.NullString{String: pattern, Valid: true},
		Column7:  status,
		Column8:  status,
		Column9:  status,
	}
	return gen.ListMessagesParams{
		Column1:  count.Column1,
		FromAddr: count.FromAddr,
		ToAddr:   count.ToAddr,
		Subject:  count.Subject,
		Address:  count.Address,
		Note:     count.Note,
		Column7:  count.Column7,
		Column8:  count.Column8,
		Column9:  count.Column9,
		Limit:    limit,
		Offset:   offset,
	}, count
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
	total, _ := s.Queries.CountMessagesByMailbox(r.Context(), mailboxID)

	out := make([]messageListItem, 0, len(rows))
	for _, m := range rows {
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

// purgeMessageFiles best-effort removes attachments for a message.
func (s *Server) purgeMessageFiles(ctx context.Context, messageID int64) {
	atts, _ := s.Queries.ListAttachmentsByMessage(ctx, messageID)
	for _, a := range atts {
		_ = s.Storage.Delete(a.StoragePath)
	}
}
