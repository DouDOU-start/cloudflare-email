package eml

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"strings"
	"time"

	"github.com/cf-email/backend/internal/db/gen"
	"github.com/cf-email/backend/internal/httpapi"
	"github.com/cf-email/backend/internal/storage"
)

func ServeMessage(ctx context.Context, w http.ResponseWriter, queries *gen.Queries, store storage.Store, msg gen.Message) error {
	filename := Filename(msg)
	if msg.RawStoragePath.Valid && msg.RawStoragePath.String != "" {
		rc, err := store.Open(msg.RawStoragePath.String)
		if err != nil {
			return err
		}
		defer rc.Close()
		httpapi.ServeAttachment(w, filename, "message/rfc822", rc)
		return nil
	}

	data, err := BuildSynthetic(ctx, queries, store, msg)
	if err != nil {
		return err
	}
	httpapi.ServeAttachment(w, filename, "message/rfc822", bytes.NewReader(data))
	return nil
}

func Filename(msg gen.Message) string {
	if msg.MessageID.Valid && msg.MessageID.String != "" {
		return safeDownloadName(msg.MessageID.String) + ".eml"
	}
	return fmt.Sprintf("message-%d.eml", msg.ID)
}

func BuildSynthetic(ctx context.Context, queries *gen.Queries, store storage.Store, msg gen.Message) ([]byte, error) {
	attachments, err := queries.ListAttachmentsByMessage(ctx, msg.ID)
	if err != nil {
		return nil, err
	}

	var root bytes.Buffer
	writeHeader(&root, "From", msg.FromAddr)
	writeHeader(&root, "To", msg.ToAddr)
	if msg.Subject.Valid && msg.Subject.String != "" {
		writeHeader(&root, "Subject", mime.QEncoding.Encode("utf-8", msg.Subject.String))
	}
	if msg.MessageID.Valid && msg.MessageID.String != "" {
		writeHeader(&root, "Message-ID", messageIDHeader(msg.MessageID.String))
	}
	writeHeader(&root, "Date", time.Unix(msg.ReceivedAt, 0).Format(time.RFC1123Z))
	writeHeader(&root, "MIME-Version", "1.0")

	body, contentType, err := buildBody(ctx, queries, store, msg, attachments)
	if err != nil {
		return nil, err
	}
	writeHeader(&root, "Content-Type", contentType)
	root.WriteString("\r\n")
	root.Write(body)
	return root.Bytes(), nil
}

func buildBody(ctx context.Context, queries *gen.Queries, store storage.Store, msg gen.Message, attachments []gen.Attachment) ([]byte, string, error) {
	messageBody, contentType, err := buildMessageBody(msg)
	if err != nil {
		return nil, "", err
	}
	if len(attachments) == 0 {
		return messageBody, contentType, nil
	}

	var body bytes.Buffer
	mixed := multipart.NewWriter(&body)
	part, err := mixed.CreatePart(textproto.MIMEHeader{"Content-Type": []string{contentType}})
	if err != nil {
		return nil, "", err
	}
	if _, err := part.Write(messageBody); err != nil {
		return nil, "", err
	}

	for _, attachment := range attachments {
		if err := writeAttachmentPart(store, mixed, attachment); err != nil {
			return nil, "", err
		}
	}
	if err := mixed.Close(); err != nil {
		return nil, "", err
	}
	_ = queries
	_ = ctx
	return body.Bytes(), mime.FormatMediaType("multipart/mixed", map[string]string{"boundary": mixed.Boundary()}), nil
}

func buildMessageBody(msg gen.Message) ([]byte, string, error) {
	textBody := msg.TextBody.String
	htmlBody := msg.HtmlBody.String
	if textBody != "" && htmlBody != "" {
		var body bytes.Buffer
		alt := multipart.NewWriter(&body)
		if err := writeTextPart(alt, "text/plain; charset=utf-8", textBody); err != nil {
			return nil, "", err
		}
		if err := writeTextPart(alt, "text/html; charset=utf-8", htmlBody); err != nil {
			return nil, "", err
		}
		if err := alt.Close(); err != nil {
			return nil, "", err
		}
		return body.Bytes(), mime.FormatMediaType("multipart/alternative", map[string]string{"boundary": alt.Boundary()}), nil
	}
	if htmlBody != "" {
		return []byte(htmlBody), "text/html; charset=utf-8", nil
	}
	return []byte(textBody), "text/plain; charset=utf-8", nil
}

func writeTextPart(writer *multipart.Writer, contentType string, body string) error {
	part, err := writer.CreatePart(textproto.MIMEHeader{
		"Content-Type":              []string{contentType},
		"Content-Transfer-Encoding": []string{"8bit"},
	})
	if err != nil {
		return err
	}
	_, err = part.Write([]byte(body))
	return err
}

func writeAttachmentPart(store storage.Store, writer *multipart.Writer, attachment gen.Attachment) error {
	rc, err := store.Open(attachment.StoragePath)
	if err != nil {
		return err
	}
	defer rc.Close()
	data, err := io.ReadAll(rc)
	if err != nil {
		return err
	}
	contentType := attachment.ContentType.String
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	part, err := writer.CreatePart(textproto.MIMEHeader{
		"Content-Type":              []string{mime.FormatMediaType(contentType, map[string]string{"name": attachment.Filename})},
		"Content-Disposition":       []string{mime.FormatMediaType("attachment", map[string]string{"filename": attachment.Filename})},
		"Content-Transfer-Encoding": []string{"base64"},
	})
	if err != nil {
		return err
	}
	writeBase64(part, data)
	return nil
}

func writeBase64(w io.Writer, data []byte) {
	for len(data) > 0 {
		n := 57
		if len(data) < n {
			n = len(data)
		}
		_, _ = w.Write([]byte(base64.StdEncoding.EncodeToString(data[:n])))
		_, _ = w.Write([]byte("\r\n"))
		data = data[n:]
	}
}

func writeHeader(w *bytes.Buffer, key string, value string) {
	value = strings.ReplaceAll(value, "\r", " ")
	value = strings.ReplaceAll(value, "\n", " ")
	w.WriteString(key)
	w.WriteString(": ")
	w.WriteString(value)
	w.WriteString("\r\n")
}

func messageIDHeader(value string) string {
	value = strings.TrimSpace(value)
	if strings.HasPrefix(value, "<") && strings.HasSuffix(value, ">") {
		return value
	}
	return "<" + strings.Trim(value, "<>") + ">"
}

func safeDownloadName(name string) string {
	name = strings.TrimSpace(name)
	name = strings.Trim(name, "<>")
	name = strings.Map(func(r rune) rune {
		switch r {
		case '/', '\\', ':', '*', '?', '"', '<', '>', '|':
			return '-'
		default:
			return r
		}
	}, name)
	if name == "" || name == "." || name == ".." {
		return "message"
	}
	if len(name) > 120 {
		name = name[:120]
	}
	return name
}
