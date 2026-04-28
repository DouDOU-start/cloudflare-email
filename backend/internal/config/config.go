package config

import (
	"fmt"
	"os"
	"strings"

	"gopkg.in/yaml.v3"
)

type Config struct {
	BindAddr        string
	PublicBaseURL   string
	DBPath          string
	StorageDir      string
	IngestSecret    string
	SessionSecret   string
	AdminUsername   string
	AdminPassword   string
	TurnstileSite   string
	TurnstileSecret string
}

// fileConfig mirrors the YAML schema. Fields are pointers/strings so we can
// tell whether the user explicitly set them.
type fileConfig struct {
	BindAddr      string `yaml:"bind_addr"`
	PublicBaseURL string `yaml:"public_base_url"`
	DBPath        string `yaml:"db_path"`
	StorageDir    string `yaml:"storage_dir"`
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
	}

	c := &Config{
		BindAddr:        firstNonEmpty(os.Getenv("BIND_ADDR"), fc.BindAddr, ":8080"),
		PublicBaseURL:   strings.TrimRight(firstNonEmpty(os.Getenv("PUBLIC_BASE_URL"), fc.PublicBaseURL), "/"),
		DBPath:          firstNonEmpty(os.Getenv("DB_PATH"), fc.DBPath, "./data/email.db"),
		StorageDir:      firstNonEmpty(os.Getenv("STORAGE_DIR"), fc.StorageDir, "./data/storage"),
		IngestSecret:    firstNonEmpty(os.Getenv("INGEST_SECRET"), fc.IngestSecret),
		SessionSecret:   firstNonEmpty(os.Getenv("SESSION_SECRET"), fc.SessionSecret),
		AdminUsername:   firstNonEmpty(os.Getenv("ADMIN_USERNAME"), fc.Admin.Username),
		AdminPassword:   firstNonEmpty(os.Getenv("ADMIN_PASSWORD"), fc.Admin.Password),
		TurnstileSite:   firstNonEmpty(os.Getenv("TURNSTILE_SITE_KEY"), fc.Turnstile.SiteKey),
		TurnstileSecret: firstNonEmpty(os.Getenv("TURNSTILE_SECRET_KEY"), fc.Turnstile.SecretKey),
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
