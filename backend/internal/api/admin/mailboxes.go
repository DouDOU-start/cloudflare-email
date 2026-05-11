package admin

import (
	"database/sql"
	"errors"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/cf-email/backend/internal/db/gen"
	"github.com/cf-email/backend/internal/httpapi"
)

type mailboxView struct {
	ID             int64  `json:"id"`
	Address        string `json:"address"`
	Note           string `json:"note"`
	AutoCreated    bool   `json:"auto_created"`
	CreatedAt      int64  `json:"created_at"`
	MessageCount   int64  `json:"message_count"`
	UnreadCount    int64  `json:"unread_count"`
	LastReceivedAt int64  `json:"last_received_at"`
}

func (s *Server) handleListMailboxes(w http.ResponseWriter, r *http.Request) {
	rows, err := s.Queries.ListMailboxes(r.Context())
	if err != nil {
		httpapi.WriteJSON(w, http.StatusInternalServerError, httpapi.Error{Error: "internal error"})
		return
	}
	out := make([]mailboxView, 0, len(rows))
	for _, r := range rows {
		out = append(out, mailboxView{
			ID:             r.ID,
			Address:        r.Address,
			Note:           r.Note.String,
			AutoCreated:    r.AutoCreated == 1,
			CreatedAt:      r.CreatedAt,
			MessageCount:   r.MessageCount,
			UnreadCount:    r.UnreadCount,
			LastReceivedAt: r.LastReceivedAt,
		})
	}
	httpapi.WriteJSON(w, http.StatusOK, out)
}

type createMailboxReq struct {
	Address string `json:"address"`
	Note    string `json:"note,omitempty"`
}

func isValidMailboxAddress(address string) bool {
	parsed, err := mail.ParseAddress(address)
	if err != nil {
		return false
	}
	if parsed.Name != "" || parsed.Address != address {
		return false
	}
	at := strings.LastIndex(address, "@")
	if at <= 0 || at == len(address)-1 {
		return false
	}
	return strings.Contains(address[at+1:], ".")
}

func (s *Server) handleCreateMailbox(w http.ResponseWriter, r *http.Request) {
	var req createMailboxReq
	if err := httpapi.DecodeJSON(r, &req); err != nil {
		httpapi.WriteJSON(w, http.StatusBadRequest, httpapi.Error{Error: "invalid body"})
		return
	}
	req.Address = strings.ToLower(strings.TrimSpace(req.Address))
	if !isValidMailboxAddress(req.Address) {
		httpapi.WriteJSON(w, http.StatusBadRequest, httpapi.Error{Error: "invalid email address"})
		return
	}
	mb, err := s.Queries.CreateMailbox(r.Context(), gen.CreateMailboxParams{
		Address:     req.Address,
		Note:        sql.NullString{String: req.Note, Valid: req.Note != ""},
		AutoCreated: 0,
		CreatedAt:   time.Now().Unix(),
	})
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			httpapi.WriteJSON(w, http.StatusConflict, httpapi.Error{Error: "mailbox already exists"})
			return
		}
		httpapi.WriteJSON(w, http.StatusInternalServerError, httpapi.Error{Error: "internal error"})
		return
	}
	httpapi.WriteJSON(w, http.StatusOK, mb)
}

type updateMailboxReq struct {
	Note string `json:"note"`
}

func (s *Server) handleUpdateMailbox(w http.ResponseWriter, r *http.Request) {
	id, err := httpapi.PathInt64(r, "id")
	if err != nil {
		httpapi.WriteJSON(w, http.StatusBadRequest, httpapi.Error{Error: "bad id"})
		return
	}
	var req updateMailboxReq
	if err := httpapi.DecodeJSON(r, &req); err != nil {
		httpapi.WriteJSON(w, http.StatusBadRequest, httpapi.Error{Error: "invalid body"})
		return
	}
	if err := s.Queries.UpdateMailboxNote(r.Context(), gen.UpdateMailboxNoteParams{
		Note: sql.NullString{String: req.Note, Valid: req.Note != ""},
		ID:   id,
	}); err != nil {
		httpapi.WriteJSON(w, http.StatusInternalServerError, httpapi.Error{Error: "internal error"})
		return
	}
	httpapi.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleDeleteMailbox(w http.ResponseWriter, r *http.Request) {
	id, err := httpapi.PathInt64(r, "id")
	if err != nil {
		httpapi.WriteJSON(w, http.StatusBadRequest, httpapi.Error{Error: "bad id"})
		return
	}
	// Cleanup stored files before cascade delete.
	attPaths, _ := s.Queries.ListAttachmentPathsByMailbox(r.Context(), id)
	for _, p := range attPaths {
		_ = s.Storage.Delete(p)
	}
	rawPaths, _ := s.Queries.ListStoragePathsByMailbox(r.Context(), id)
	for _, p := range rawPaths {
		if p.Valid {
			_ = s.Storage.Delete(p.String)
		}
	}
	if err := s.Queries.DeleteMailbox(r.Context(), id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpapi.WriteJSON(w, http.StatusNotFound, httpapi.Error{Error: "not found"})
			return
		}
		httpapi.WriteJSON(w, http.StatusInternalServerError, httpapi.Error{Error: "internal error"})
		return
	}
	httpapi.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
