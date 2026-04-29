package config

import (
	"os"
	"path/filepath"
	"strings"
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
	if cfg.IngestToken == "" || cfg.IngestSecret == "" || cfg.SessionSecret == "" || cfg.AdminAPIKey == "" {
		t.Fatalf("generated secrets must not be empty")
	}
	if len(cfg.IngestToken) != 64 || len(cfg.IngestSecret) != 64 || len(cfg.SessionSecret) != 64 || len(cfg.AdminAPIKey) != 64 {
		t.Fatalf("generated secrets must be 64 hex characters")
	}
	if _, err := os.Stat(cfg.ConfigPath); err != nil {
		t.Fatalf("stat initialized config: %v", err)
	}
}

func TestAdminAPIKeyUpdate(t *testing.T) {
	t.Setenv("CONFIG_PATH", filepath.Join(t.TempDir(), "config.yaml"))
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	store := NewStore(cfg)

	key := "new-admin-api-key"
	settings, err := store.UpdateSystemSettings(SystemPatch{AdminAPIKey: &key})
	if err != nil {
		t.Fatalf("UpdateSystemSettings() error = %v", err)
	}
	if settings.AdminAPIKey != key || store.Snapshot().AdminAPIKey != key {
		t.Fatalf("admin api key was not updated")
	}

	data, err := os.ReadFile(cfg.ConfigPath)
	if err != nil {
		t.Fatalf("read config: %v", err)
	}
	if !strings.Contains(string(data), "admin_api_key: new-admin-api-key") {
		t.Fatalf("config file did not store plaintext admin_api_key: %s", data)
	}
}

func TestAdminAPIKeyEnvOverride(t *testing.T) {
	t.Setenv("CONFIG_PATH", filepath.Join(t.TempDir(), "config.yaml"))
	t.Setenv("ADMIN_API_KEY", "env-admin-api-key")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.AdminAPIKey != "env-admin-api-key" {
		t.Fatalf("env key was not applied")
	}
	settings := NewStore(cfg).SystemSettings()
	if settings.Editable.AdminAPIKey {
		t.Fatalf("env-controlled API key should not be editable")
	}
}
