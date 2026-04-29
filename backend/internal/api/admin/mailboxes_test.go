package admin

import (
	"net/http/httptest"
	"testing"
)

func TestIsValidMailboxAddress(t *testing.T) {
	tests := []struct {
		address string
		want    bool
	}{
		{"user@example.com", true},
		{"user.name+tag@example.co.uk", true},
		{"aaa@", false},
		{"@example.com", false},
		{"user@example", false},
		{"user example@example.com", false},
		{"Name <user@example.com>", false},
		{"user@example.com,other@example.com", false},
	}
	for _, tt := range tests {
		if got := isValidMailboxAddress(tt.address); got != tt.want {
			t.Fatalf("isValidMailboxAddress(%q) = %v, want %v", tt.address, got, tt.want)
		}
	}
}

func TestSecureCookieFollowsRequestScheme(t *testing.T) {
	tests := []struct {
		name           string
		scheme         string
		cookieInsecure bool
		want           bool
	}{
		{name: "https", scheme: "https", want: true},
		{name: "http", scheme: "http", want: false},
		{name: "explicit insecure", scheme: "https", cookieInsecure: true, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := &Server{CookieInsecure: tt.cookieInsecure}
			req := httptest.NewRequest("GET", "http://mail.example.com/admin", nil)
			req.Header.Set("X-Forwarded-Proto", tt.scheme)
			if got := s.secureCookie(req); got != tt.want {
				t.Fatalf("secureCookie() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestTokenURLFollowsRequestHost(t *testing.T) {
	req := httptest.NewRequest("GET", "http://127.0.0.1:8080/api/admin/tokens", nil)
	req.Header.Set("X-Forwarded-Proto", "https")
	req.Header.Set("X-Forwarded-Host", "mail.example.com")

	got := (&Server{}).tokenURL(req, "secret-token")
	want := "https://mail.example.com/v/secret-token"
	if got != want {
		t.Fatalf("tokenURL() = %q, want %q", got, want)
	}
}
