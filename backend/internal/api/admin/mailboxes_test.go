package admin

import "testing"

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

func TestSecureCookieFollowsPublicBaseURL(t *testing.T) {
	tests := []struct {
		name           string
		publicBaseURL  string
		cookieInsecure bool
		want           bool
	}{
		{name: "https", publicBaseURL: "https://mail.example.com", want: true},
		{name: "http", publicBaseURL: "http://96.44.172.247:8081", want: false},
		{name: "explicit insecure", publicBaseURL: "https://mail.example.com", cookieInsecure: true, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := &Server{PublicBaseURL: tt.publicBaseURL, CookieInsecure: tt.cookieInsecure}
			if got := s.secureCookie(); got != tt.want {
				t.Fatalf("secureCookie() = %v, want %v", got, tt.want)
			}
		})
	}
}
