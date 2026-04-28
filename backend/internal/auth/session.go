package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const SessionCookieName = "cf_email_session"

type Session struct {
	AdminID   int64
	ExpiresAt time.Time
}

// IssueSession produces the cookie value:  <admin_id>.<exp_unix>.<sig>
func IssueSession(secret string, adminID int64, ttl time.Duration) (string, time.Time) {
	exp := time.Now().Add(ttl)
	payload := fmt.Sprintf("%d.%d", adminID, exp.Unix())
	return payload + "." + sign(secret, payload), exp
}

// VerifySession parses + validates the cookie value.
func VerifySession(secret, cookieValue string) (*Session, error) {
	parts := strings.Split(cookieValue, ".")
	if len(parts) != 3 {
		return nil, errors.New("malformed session")
	}
	payload := parts[0] + "." + parts[1]
	if !hmac.Equal([]byte(sign(secret, payload)), []byte(parts[2])) {
		return nil, errors.New("bad signature")
	}
	adminID, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return nil, fmt.Errorf("bad admin id: %w", err)
	}
	exp, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil {
		return nil, fmt.Errorf("bad expiry: %w", err)
	}
	expT := time.Unix(exp, 0)
	if time.Now().After(expT) {
		return nil, errors.New("session expired")
	}
	return &Session{AdminID: adminID, ExpiresAt: expT}, nil
}

func sign(secret, payload string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	return hex.EncodeToString(mac.Sum(nil))
}

// SetSessionCookie writes the session cookie on the response.
func SetSessionCookie(w http.ResponseWriter, value string, exp time.Time, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    value,
		Path:     "/",
		Expires:  exp,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteStrictMode,
	})
}

// ClearSessionCookie expires the cookie client-side.
func ClearSessionCookie(w http.ResponseWriter, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteStrictMode,
	})
}
