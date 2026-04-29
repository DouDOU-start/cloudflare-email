package ingest

import (
	"context"
	"crypto/subtle"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/cf-email/backend/internal/config"
	"github.com/cf-email/backend/internal/db/gen"
	mimex "github.com/cf-email/backend/internal/mime"
	"github.com/cf-email/backend/internal/storage"
)

type Handler struct {
	Config  *config.Store
	Queries *gen.Queries
	DB      *sql.DB
	Storage storage.Store
	Logger  *slog.Logger
}

const hardReadCap = 25 * 1024 * 1024

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	cfg := h.Config.Snapshot()
	if subtle.ConstantTimeCompare([]byte(r.Header.Get("Authorization")), []byte("Bearer "+cfg.IngestToken)) != 1 {
		h.Logger.Warn("ingest bad token", "ip", r.RemoteAddr)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, hardReadCap+1))
	if err != nil {
		http.Error(w, "read body", http.StatusBadRequest)
		return
	}
	if len(body) > hardReadCap {
		http.Error(w, "too large", http.StatusRequestEntityTooLarge)
		return
	}

	skew := time.Duration(IngestClockSkew) * time.Second
	if err := VerifySignature(cfg.IngestSecret, r.Header.Get("X-Timestamp"), r.Header.Get("X-Signature"), body, skew); err != nil {
		h.Logger.Warn("ingest bad signature", "err", err, "ip", r.RemoteAddr)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	envelopeFrom := strings.ToLower(strings.TrimSpace(r.Header.Get("X-Envelope-From")))
	envelopeTo := strings.ToLower(strings.TrimSpace(r.Header.Get("X-Envelope-To")))

	decision := h.process(ctx, envelopeFrom, envelopeTo, body)

	switch decision.Outcome {
	case OutcomeAccepted:
		w.WriteHeader(http.StatusOK)
	case OutcomeDroppedSize:
		http.Error(w, "too large", http.StatusRequestEntityTooLarge)
	default:
		// Silent drop: tell Worker we handled it (don't retry) but don't
		// reveal which filter fired.
		w.WriteHeader(http.StatusNoContent)
	}
}

func (h *Handler) process(ctx context.Context, envFrom, envTo string, body []byte) Decision {
	if d := CheckSize(len(body)); d.Outcome != OutcomeAccepted {
		return d
	}

	parsed, err := mimex.Parse(body)
	if err != nil {
		return Drop(OutcomeDroppedParse, err.Error())
	}

	headerFrom := mimex.ExtractAddress(parsed.From)
	if headerFrom == "" {
		headerFrom = envFrom
	}
	headerTo := mimex.ExtractAddress(parsed.To)
	if headerTo == "" {
		headerTo = envTo
	}
	if headerTo == "" {
		return Drop(OutcomeDroppedParse, "missing recipient")
	}

	mailbox, err := h.resolveMailbox(ctx, headerTo)
	if err != nil {
		h.Logger.Error("resolve mailbox", "err", err)
		return Drop(OutcomeDroppedParse, "db error")
	}

	if err := h.store(ctx, mailbox.ID, headerFrom, headerTo, parsed, body); err != nil {
		h.Logger.Error("store message", "err", err)
		return Drop(OutcomeDroppedParse, "store error")
	}

	return Accept()
}

// resolveMailbox returns the mailbox for address, creating it on the fly if
// it doesn't exist yet.
func (h *Handler) resolveMailbox(ctx context.Context, address string) (gen.Mailbox, error) {
	mb, err := h.Queries.GetMailboxByAddress(ctx, address)
	if err == nil {
		return mb, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return gen.Mailbox{}, err
	}
	mb, err = h.Queries.CreateMailbox(ctx, gen.CreateMailboxParams{
		Address:     address,
		Note:        sql.NullString{},
		AutoCreated: 1,
		CreatedAt:   time.Now().Unix(),
	})
	if err == nil {
		return mb, nil
	}
	if strings.Contains(err.Error(), "UNIQUE") {
		return h.Queries.GetMailboxByAddress(ctx, address)
	}
	return gen.Mailbox{}, err
}

func (h *Handler) store(ctx context.Context, mailboxID int64, from, to string, parsed *mimex.Parsed, raw []byte) error {
	receivedAt := time.Now()
	now := receivedAt.Unix()
	textBody := nullableString(parsed.TextBody)
	htmlBody := nullableString(parsed.HTMLBody)
	rawKey := fmt.Sprintf("messages/%d/%d.eml", mailboxID, receivedAt.UnixNano())

	tx, err := h.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	writtenKeys := make([]string, 0, len(parsed.Attachments)+1)
	committed := false
	defer func() {
		if committed {
			return
		}
		for _, key := range writtenKeys {
			_ = h.Storage.Delete(key)
		}
	}()
	qx := h.Queries.WithTx(tx)

	if err := h.Storage.Put(rawKey, raw); err != nil {
		return fmt.Errorf("put raw message: %w", err)
	}
	writtenKeys = append(writtenKeys, rawKey)

	msg, err := qx.CreateMessage(ctx, gen.CreateMessageParams{
		MailboxID:      mailboxID,
		MessageID:      nullableString(parsed.MessageID),
		FromAddr:       from,
		ToAddr:         to,
		Subject:        nullableString(parsed.Subject),
		ReceivedAt:     now,
		TextBody:       textBody,
		HtmlBody:       htmlBody,
		Size:           int64(len(raw)),
		RawStoragePath: sql.NullString{String: rawKey, Valid: true},
	})
	if err != nil {
		return fmt.Errorf("create message: %w", err)
	}

	for i, a := range parsed.Attachments {
		attKey := fmt.Sprintf("attachments/%d/%d-%s", msg.ID, i, safeFilename(a.Filename))
		if err := h.Storage.Put(attKey, a.Data); err != nil {
			return fmt.Errorf("put attachment: %w", err)
		}
		writtenKeys = append(writtenKeys, attKey)
		if _, err := qx.CreateAttachment(ctx, gen.CreateAttachmentParams{
			MessageID:   msg.ID,
			Filename:    a.Filename,
			ContentType: sql.NullString{String: a.ContentType, Valid: a.ContentType != ""},
			Size:        int64(len(a.Data)),
			StoragePath: attKey,
		}); err != nil {
			return fmt.Errorf("create attachment: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return err
	}
	committed = true
	return nil
}

func nullableString(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}

func safeFilename(name string) string {
	name = filepath.Base(name)
	if name == "" || name == "." || name == ".." {
		return "file"
	}
	// strip path separators defensively
	name = strings.ReplaceAll(name, "/", "_")
	name = strings.ReplaceAll(name, "\\", "_")
	if len(name) > 120 {
		name = name[:120]
	}
	return name
}
