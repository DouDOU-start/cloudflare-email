package storage

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// Store is a tiny blob interface so we can swap filesystem for S3/R2 later.
type Store interface {
	Put(key string, data []byte) error
	Open(key string) (io.ReadCloser, error)
	Delete(key string) error
}

type FS struct {
	Root string
}

func NewFS(root string) (*FS, error) {
	if err := os.MkdirAll(root, 0o755); err != nil {
		return nil, err
	}
	return &FS{Root: root}, nil
}

func (f *FS) resolve(key string) (string, error) {
	clean := filepath.Clean("/" + key)
	if strings.Contains(clean, "..") {
		return "", fmt.Errorf("invalid key: %q", key)
	}
	return filepath.Join(f.Root, clean), nil
}

func (f *FS) Put(key string, data []byte) error {
	p, err := f.resolve(key)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	return os.WriteFile(p, data, 0o644)
}

func (f *FS) Open(key string) (io.ReadCloser, error) {
	p, err := f.resolve(key)
	if err != nil {
		return nil, err
	}
	return os.Open(p)
}

func (f *FS) Delete(key string) error {
	p, err := f.resolve(key)
	if err != nil {
		return err
	}
	return os.Remove(p)
}
