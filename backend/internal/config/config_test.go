package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadInitializesMissingConfig(t *testing.T) {
	t.Setenv("CONFIG_PATH", filepath.Join(t.TempDir(), "config.yaml"))

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.AdminUsername != "admin" || cfg.AdminPassword != "admin" {
		t.Fatalf("admin credentials = %q/%q, want admin/admin", cfg.AdminUsername, cfg.AdminPassword)
	}
	if cfg.IngestToken == "" || cfg.IngestSecret == "" || cfg.SessionSecret == "" {
		t.Fatalf("generated secrets must not be empty")
	}
	if len(cfg.IngestToken) != 64 || len(cfg.IngestSecret) != 64 || len(cfg.SessionSecret) != 64 {
		t.Fatalf("generated secrets must be 64 hex characters")
	}
	if _, err := os.Stat(cfg.ConfigPath); err != nil {
		t.Fatalf("stat initialized config: %v", err)
	}
}
