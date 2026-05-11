package db

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"os"
	"path/filepath"

	"github.com/cf-email/backend/internal/db/gen"
	"github.com/pressly/goose/v3"

	_ "modernc.org/sqlite"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// Open opens a SQLite database at path, applies pending migrations, and
// returns a raw *sql.DB plus a sqlc-generated Queries handle.
func Open(ctx context.Context, path string) (*sql.DB, *gen.Queries, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, nil, fmt.Errorf("create db dir: %w", err)
	}

	dsn := fmt.Sprintf(
		"file:%s?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)&_pragma=synchronous(NORMAL)",
		path,
	)
	conn, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, nil, fmt.Errorf("open sqlite: %w", err)
	}
	// WAL mode allows concurrent readers; keep writer serialized via busy_timeout.
	conn.SetMaxOpenConns(4)
	conn.SetMaxIdleConns(4)

	if err := conn.PingContext(ctx); err != nil {
		_ = conn.Close()
		return nil, nil, fmt.Errorf("ping sqlite: %w", err)
	}

	if err := migrate(ctx, conn); err != nil {
		_ = conn.Close()
		return nil, nil, fmt.Errorf("migrate: %w", err)
	}

	return conn, gen.New(conn), nil
}

func migrate(ctx context.Context, conn *sql.DB) error {
	goose.SetBaseFS(migrationsFS)
	if err := goose.SetDialect("sqlite3"); err != nil {
		return err
	}
	return goose.UpContext(ctx, conn, "migrations")
}
