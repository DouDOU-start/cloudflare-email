package code

import (
	"bytes"
	"context"
	"database/sql"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/cf-email/backend/internal/config"
	"github.com/cf-email/backend/internal/db"
	"github.com/cf-email/backend/internal/db/gen"
)

func TestEmailCodeEndpoint(t *testing.T) {
	ctx := context.Background()
	conn, queries, err := db.Open(ctx, filepath.Join(t.TempDir(), "email.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer conn.Close()

	mb, err := queries.CreateMailbox(ctx, gen.CreateMailboxParams{
		Address:     "user@example.com",
		Note:        sql.NullString{},
		AutoCreated: 1,
		CreatedAt:   time.Now().Unix(),
	})
	if err != nil {
		t.Fatalf("create mailbox: %v", err)
	}
	older, err := queries.CreateMessage(ctx, gen.CreateMessageParams{
		MailboxID:  mb.ID,
		FromAddr:   "Service <noreply@mail.example.com>",
		ToAddr:     "User <user@example.com>",
		Subject:    sql.NullString{String: "旧验证码", Valid: true},
		ReceivedAt: time.Now().Add(-time.Minute).Unix(),
		TextBody:   sql.NullString{String: "验证码 111111", Valid: true},
		Size:       10,
	})
	if err != nil {
		t.Fatalf("create older message: %v", err)
	}
	latest, err := queries.CreateMessage(ctx, gen.CreateMessageParams{
		MailboxID:  mb.ID,
		FromAddr:   "Service <noreply@mail.example.com>",
		ToAddr:     "User <user@example.com>",
		Subject:    sql.NullString{String: "Your temporary ChatGPT login code", Valid: true},
		ReceivedAt: time.Now().Unix(),
		TextBody:   sql.NullString{String: "Enter this temporary verification code to continue: 222222", Valid: true},
		Size:       10,
	})
	if err != nil {
		t.Fatalf("create latest message: %v", err)
	}

	apiKey := "test_api_key_1234567890"
	server := &Server{
		Queries: queries,
		Config:  config.NewStore(&config.Config{AdminAPIKey: apiKey}),
	}
	router := server.Routes()

	req := httptest.NewRequest(http.MethodPost, "/email", bytes.NewBufferString(`{"recipient":"user@example.com","platform":"openai","sender_suffix":"example.com"}`))
	req.Header.Set("Authorization", "Bearer "+apiKey)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rr.Code, rr.Body.String())
	}
	if !bytes.Contains(rr.Body.Bytes(), []byte(`"code":"222222"`)) {
		t.Fatalf("response body = %s", rr.Body.String())
	}

	latestAfter, err := queries.GetMessageByID(ctx, latest.ID)
	if err != nil {
		t.Fatalf("get latest: %v", err)
	}
	if latestAfter.IsRead != 1 {
		t.Fatalf("latest IsRead = %d, want 1", latestAfter.IsRead)
	}
	olderAfter, err := queries.GetMessageByID(ctx, older.ID)
	if err != nil {
		t.Fatalf("get older: %v", err)
	}
	if olderAfter.IsRead != 0 {
		t.Fatalf("older IsRead = %d, want 0", olderAfter.IsRead)
	}
}

func TestEmailCodeEndpointMarkReadFalse(t *testing.T) {
	ctx := context.Background()
	conn, queries, err := db.Open(ctx, filepath.Join(t.TempDir(), "email.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer conn.Close()

	mb, err := queries.CreateMailbox(ctx, gen.CreateMailboxParams{Address: "user@example.com", AutoCreated: 1, CreatedAt: time.Now().Unix()})
	if err != nil {
		t.Fatalf("create mailbox: %v", err)
	}
	msg, err := queries.CreateMessage(ctx, gen.CreateMessageParams{
		MailboxID:  mb.ID,
		FromAddr:   "noreply@example.com",
		ToAddr:     "user@example.com",
		ReceivedAt: time.Now().Unix(),
		TextBody:   sql.NullString{String: "Enter this temporary verification code to continue: 333333", Valid: true},
		Size:       10,
	})
	if err != nil {
		t.Fatalf("create message: %v", err)
	}

	apiKey := "test_api_key_1234567890"
	server := &Server{Queries: queries, Config: config.NewStore(&config.Config{AdminAPIKey: apiKey})}
	req := httptest.NewRequest(http.MethodPost, "/email", bytes.NewBufferString(`{"recipient":"user@example.com","platform":"openai","sender_suffix":"example.com","mark_read":false}`))
	req.Header.Set("Authorization", "Bearer "+apiKey)
	rr := httptest.NewRecorder()
	server.Routes().ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rr.Code, rr.Body.String())
	}

	after, err := queries.GetMessageByID(ctx, msg.ID)
	if err != nil {
		t.Fatalf("get message: %v", err)
	}
	if after.IsRead != 0 {
		t.Fatalf("IsRead = %d, want 0", after.IsRead)
	}
}

func TestEmailCodeEndpointRequiresPlatform(t *testing.T) {
	server := &Server{Config: config.NewStore(&config.Config{AdminAPIKey: "good_key_1234567890"})}
	requestBody := `{"recipient":"user@example.com","sender_suffix":"example.com"}`
	request := httptest.NewRequest(http.MethodPost, "/email", bytes.NewBufferString(requestBody))
	request.Header.Set("Authorization", "Bearer good_key_1234567890")
	response := httptest.NewRecorder()

	server.Routes().ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusBadRequest)
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"error":"invalid platform"`)) {
		t.Fatalf("response body = %s", response.Body.String())
	}
}

func TestEmailCodeEndpointAuthAndDisabled(t *testing.T) {
	server := &Server{Config: config.NewStore(&config.Config{})}
	req := httptest.NewRequest(http.MethodPost, "/email", bytes.NewBufferString(`{}`))
	rr := httptest.NewRecorder()
	server.Routes().ServeHTTP(rr, req)
	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusServiceUnavailable)
	}

	server = &Server{Config: config.NewStore(&config.Config{AdminAPIKey: "good_key_1234567890"})}
	req = httptest.NewRequest(http.MethodPost, "/email", bytes.NewBufferString(`{}`))
	req.Header.Set("Authorization", "Bearer bad_key_1234567890")
	rr = httptest.NewRecorder()
	server.Routes().ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusUnauthorized)
	}
}
