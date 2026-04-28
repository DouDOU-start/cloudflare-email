package mime

import (
	"bytes"
	"strings"

	"github.com/jhillyerd/enmime"
)

type Attachment struct {
	Filename    string
	ContentType string
	Data        []byte
}

type Parsed struct {
	From        string
	To          string
	Subject     string
	MessageID   string
	TextBody    string
	HTMLBody    string
	Attachments []Attachment
	SizeBytes   int
}

func Parse(raw []byte) (*Parsed, error) {
	env, err := enmime.ReadEnvelope(bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}

	atts := make([]Attachment, 0, len(env.Attachments)+len(env.Inlines))
	for _, a := range env.Attachments {
		atts = append(atts, Attachment{Filename: a.FileName, ContentType: a.ContentType, Data: a.Content})
	}
	for _, a := range env.Inlines {
		atts = append(atts, Attachment{Filename: a.FileName, ContentType: a.ContentType, Data: a.Content})
	}

	p := &Parsed{
		From:        env.GetHeader("From"),
		To:          env.GetHeader("To"),
		Subject:     env.GetHeader("Subject"),
		MessageID:   strings.Trim(env.GetHeader("Message-ID"), "<>"),
		TextBody:    env.Text,
		HTMLBody:    env.HTML,
		Attachments: atts,
		SizeBytes:   len(raw),
	}
	return p, nil
}

// ExtractAddress returns the bare email from a header like `"Alice" <a@b.com>`.
func ExtractAddress(header string) string {
	header = strings.TrimSpace(header)
	if lt := strings.LastIndex(header, "<"); lt != -1 {
		if gt := strings.Index(header[lt:], ">"); gt != -1 {
			return strings.ToLower(strings.TrimSpace(header[lt+1 : lt+gt]))
		}
	}
	return strings.ToLower(header)
}

// Domain returns the part after @, lowercased.
func Domain(addr string) string {
	addr = strings.ToLower(addr)
	if at := strings.LastIndex(addr, "@"); at != -1 && at < len(addr)-1 {
		return addr[at+1:]
	}
	return ""
}
