package config

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"gopkg.in/yaml.v3"
)

type Config struct {
	ConfigPath      string
	BindAddr        string
	PublicBaseURL   string
	DBPath          string
	StorageDir      string
	IngestToken     string
	IngestSecret    string
	SessionSecret   string
	AdminUsername   string
	AdminPassword   string
	TurnstileSite   string
	TurnstileSecret string
}

type Store struct {
	mu  sync.RWMutex
	cfg Config
}

type EditableFields struct {
	IngestToken   bool `json:"ingest_token"`
	IngestSecret  bool `json:"ingest_secret"`
	SessionSecret bool `json:"session_secret"`
	AdminUsername bool `json:"admin_username"`
	AdminPassword bool `json:"admin_password"`
}

type SystemSettings struct {
	IngestToken      string         `json:"ingest_token"`
	IngestSecretSet  bool           `json:"ingest_secret_set"`
	SessionSecretSet bool           `json:"session_secret_set"`
	AdminUsername    string         `json:"admin_username"`
	AdminPasswordSet bool           `json:"admin_password_set"`
	Editable         EditableFields `json:"editable"`
}

type SystemPatch struct {
	IngestToken   *string
	IngestSecret  *string
	SessionSecret *string
	AdminUsername *string
	AdminPassword *string
}

// fileConfig mirrors the YAML schema. Fields are pointers/strings so we can
// tell whether the user explicitly set them.
type fileConfig struct {
	BindAddr      string `yaml:"bind_addr"`
	PublicBaseURL string `yaml:"public_base_url"`
	DBPath        string `yaml:"db_path"`
	StorageDir    string `yaml:"storage_dir"`
	IngestToken   string `yaml:"ingest_token"`
	IngestSecret  string `yaml:"ingest_secret"`
	SessionSecret string `yaml:"session_secret"`
	Admin         struct {
		Username string `yaml:"username"`
		Password string `yaml:"password"`
	} `yaml:"admin"`
	Turnstile struct {
		SiteKey   string `yaml:"site_key"`
		SecretKey string `yaml:"secret_key"`
	} `yaml:"turnstile"`
}

// Load reads config.yaml (path from CONFIG_PATH, default ./config.yaml).
// Environment variables override matching YAML fields.
func Load() (*Config, error) {
	var fc fileConfig
	path := getEnv("CONFIG_PATH", "./config.yaml")
	if data, err := os.ReadFile(path); err == nil {
		if err := yaml.Unmarshal(data, &fc); err != nil {
			return nil, fmt.Errorf("parse %s: %w", path, err)
		}
	} else if !os.IsNotExist(err) {
		return nil, fmt.Errorf("read %s: %w", path, err)
	} else {
		var err error
		fc, err = initConfigFile(path)
		if err != nil {
			return nil, err
		}
	}

	c := &Config{
		ConfigPath:      path,
		BindAddr:        firstNonEmpty(os.Getenv("BIND_ADDR"), fc.BindAddr, ":8080"),
		PublicBaseURL:   strings.TrimRight(firstNonEmpty(os.Getenv("PUBLIC_BASE_URL"), fc.PublicBaseURL), "/"),
		DBPath:          firstNonEmpty(os.Getenv("DB_PATH"), fc.DBPath, "./data/email.db"),
		StorageDir:      firstNonEmpty(os.Getenv("STORAGE_DIR"), fc.StorageDir, "./data/storage"),
		IngestToken:     firstNonEmpty(os.Getenv("INGEST_TOKEN"), fc.IngestToken),
		IngestSecret:    firstNonEmpty(os.Getenv("INGEST_SECRET"), fc.IngestSecret),
		SessionSecret:   firstNonEmpty(os.Getenv("SESSION_SECRET"), fc.SessionSecret),
		AdminUsername:   firstNonEmpty(os.Getenv("ADMIN_USERNAME"), fc.Admin.Username),
		AdminPassword:   firstNonEmpty(os.Getenv("ADMIN_PASSWORD"), fc.Admin.Password),
		TurnstileSite:   firstNonEmpty(os.Getenv("TURNSTILE_SITE_KEY"), fc.Turnstile.SiteKey),
		TurnstileSecret: firstNonEmpty(os.Getenv("TURNSTILE_SECRET_KEY"), fc.Turnstile.SecretKey),
	}

	if c.IngestToken == "" {
		return nil, fmt.Errorf("ingest_token is required (set in %s or INGEST_TOKEN env)", path)
	}
	if c.IngestSecret == "" {
		return nil, fmt.Errorf("ingest_secret is required (set in %s or INGEST_SECRET env)", path)
	}
	if c.SessionSecret == "" {
		return nil, fmt.Errorf("session_secret is required (set in %s or SESSION_SECRET env)", path)
	}
	if c.PublicBaseURL == "" {
		return nil, fmt.Errorf("public_base_url is required (set in %s or PUBLIC_BASE_URL env)", path)
	}
	if c.AdminUsername == "" || c.AdminPassword == "" {
		return nil, fmt.Errorf("admin.username/admin.password must be set in %s or ADMIN_USERNAME/ADMIN_PASSWORD env", path)
	}
	return c, nil
}

func initConfigFile(path string) (fileConfig, error) {
	var fc fileConfig
	fc.BindAddr = ":8080"
	fc.PublicBaseURL = "http://localhost:8080"
	fc.DBPath = "./data/email.db"
	fc.StorageDir = "./data/storage"
	fc.Admin.Username = "admin"
	fc.Admin.Password = "admin"

	var err error
	if fc.IngestToken, err = randomHex(32); err != nil {
		return fileConfig{}, err
	}
	if fc.IngestSecret, err = randomHex(32); err != nil {
		return fileConfig{}, err
	}
	if fc.SessionSecret, err = randomHex(32); err != nil {
		return fileConfig{}, err
	}

	if dir := filepath.Dir(path); dir != "." {
		if err := os.MkdirAll(dir, 0o750); err != nil {
			return fileConfig{}, fmt.Errorf("create config dir: %w", err)
		}
	}
	out, err := yaml.Marshal(&fc)
	if err != nil {
		return fileConfig{}, fmt.Errorf("marshal initial config: %w", err)
	}
	if err := atomicWriteFile(path, out, 0o600); err != nil {
		return fileConfig{}, err
	}
	return fc, nil
}

func randomHex(bytes int) (string, error) {
	b := make([]byte, bytes)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate secret: %w", err)
	}
	return hex.EncodeToString(b), nil
}

func NewStore(cfg *Config) *Store {
	if cfg == nil {
		return &Store{}
	}
	return &Store{cfg: *cfg}
}

func (s *Store) Snapshot() Config {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.cfg
}

func (s *Store) SystemSettings() SystemSettings {
	cfg := s.Snapshot()
	return systemSettingsFromConfig(cfg)
}

func (s *Store) UpdateSystemSettings(patch SystemPatch) (SystemSettings, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if patch.IngestToken == nil && patch.IngestSecret == nil && patch.SessionSecret == nil && patch.AdminUsername == nil && patch.AdminPassword == nil {
		return systemSettingsFromConfig(s.cfg), nil
	}
	if err := validatePatch(patch); err != nil {
		return SystemSettings{}, err
	}
	if err := rejectEnvOverrides(patch); err != nil {
		return SystemSettings{}, err
	}

	path := s.cfg.ConfigPath
	data, err := os.ReadFile(path)
	if err != nil {
		return SystemSettings{}, fmt.Errorf("read %s: %w", path, err)
	}

	var fc fileConfig
	if err := yaml.Unmarshal(data, &fc); err != nil {
		return SystemSettings{}, fmt.Errorf("parse %s: %w", path, err)
	}

	if patch.IngestToken != nil {
		fc.IngestToken = strings.TrimSpace(*patch.IngestToken)
	}
	if patch.IngestSecret != nil {
		fc.IngestSecret = strings.TrimSpace(*patch.IngestSecret)
	}
	if patch.SessionSecret != nil {
		fc.SessionSecret = strings.TrimSpace(*patch.SessionSecret)
	}
	if patch.AdminUsername != nil {
		fc.Admin.Username = strings.TrimSpace(*patch.AdminUsername)
	}
	if patch.AdminPassword != nil {
		fc.Admin.Password = *patch.AdminPassword
	}

	updated := s.cfg
	updated.IngestToken = firstNonEmpty(os.Getenv("INGEST_TOKEN"), fc.IngestToken)
	updated.IngestSecret = firstNonEmpty(os.Getenv("INGEST_SECRET"), fc.IngestSecret)
	updated.SessionSecret = firstNonEmpty(os.Getenv("SESSION_SECRET"), fc.SessionSecret)
	updated.AdminUsername = firstNonEmpty(os.Getenv("ADMIN_USERNAME"), fc.Admin.Username)
	updated.AdminPassword = firstNonEmpty(os.Getenv("ADMIN_PASSWORD"), fc.Admin.Password)
	if updated.IngestToken == "" || updated.IngestSecret == "" || updated.SessionSecret == "" || updated.AdminUsername == "" || updated.AdminPassword == "" {
		return SystemSettings{}, fmt.Errorf("system config fields must not be empty")
	}

	out, err := yaml.Marshal(&fc)
	if err != nil {
		return SystemSettings{}, fmt.Errorf("marshal config: %w", err)
	}
	if err := atomicWriteFile(path, out, 0o600); err != nil {
		return SystemSettings{}, err
	}

	s.cfg = updated
	return systemSettingsFromConfig(s.cfg), nil
}

func systemSettingsFromConfig(cfg Config) SystemSettings {
	return SystemSettings{
		IngestToken:      cfg.IngestToken,
		IngestSecretSet:  cfg.IngestSecret != "",
		SessionSecretSet: cfg.SessionSecret != "",
		AdminUsername:    cfg.AdminUsername,
		AdminPasswordSet: cfg.AdminPassword != "",
		Editable: EditableFields{
			IngestToken:   os.Getenv("INGEST_TOKEN") == "",
			IngestSecret:  os.Getenv("INGEST_SECRET") == "",
			SessionSecret: os.Getenv("SESSION_SECRET") == "",
			AdminUsername: os.Getenv("ADMIN_USERNAME") == "",
			AdminPassword: os.Getenv("ADMIN_PASSWORD") == "",
		},
	}
}

func validatePatch(patch SystemPatch) error {
	if patch.IngestToken != nil && strings.TrimSpace(*patch.IngestToken) == "" {
		return fmt.Errorf("ingest_token is required")
	}
	if patch.IngestSecret != nil && strings.TrimSpace(*patch.IngestSecret) == "" {
		return fmt.Errorf("ingest_secret is required")
	}
	if patch.SessionSecret != nil && strings.TrimSpace(*patch.SessionSecret) == "" {
		return fmt.Errorf("session_secret is required")
	}
	if patch.AdminUsername != nil && strings.TrimSpace(*patch.AdminUsername) == "" {
		return fmt.Errorf("admin_username is required")
	}
	if patch.AdminPassword != nil && *patch.AdminPassword == "" {
		return fmt.Errorf("admin_password is required")
	}
	return nil
}

func rejectEnvOverrides(patch SystemPatch) error {
	if patch.IngestToken != nil && os.Getenv("INGEST_TOKEN") != "" {
		return fmt.Errorf("ingest_token is controlled by environment")
	}
	if patch.IngestSecret != nil && os.Getenv("INGEST_SECRET") != "" {
		return fmt.Errorf("ingest_secret is controlled by environment")
	}
	if patch.SessionSecret != nil && os.Getenv("SESSION_SECRET") != "" {
		return fmt.Errorf("session_secret is controlled by environment")
	}
	if patch.AdminUsername != nil && os.Getenv("ADMIN_USERNAME") != "" {
		return fmt.Errorf("admin_username is controlled by environment")
	}
	if patch.AdminPassword != nil && os.Getenv("ADMIN_PASSWORD") != "" {
		return fmt.Errorf("admin_password is controlled by environment")
	}
	return nil
}

func atomicWriteFile(path string, data []byte, perm os.FileMode) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".config-*.tmp")
	if err != nil {
		return fmt.Errorf("create temp config: %w", err)
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)

	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("write temp config: %w", err)
	}
	if err := tmp.Chmod(perm); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("chmod temp config: %w", err)
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("sync temp config: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("close temp config: %w", err)
	}
	if err := os.Rename(tmpName, path); err != nil {
		return fmt.Errorf("replace config: %w", err)
	}
	return nil
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}
