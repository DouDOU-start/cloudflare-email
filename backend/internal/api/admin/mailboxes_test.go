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
