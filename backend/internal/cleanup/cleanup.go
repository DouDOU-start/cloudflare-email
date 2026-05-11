package cleanup

import (
	"context"
	"log/slog"
	"time"

	"github.com/cf-email/backend/internal/config"
	"github.com/cf-email/backend/internal/db/gen"
	"github.com/cf-email/backend/internal/storage"
)

type Worker struct {
	Config  *config.Store
	Queries *gen.Queries
	Storage storage.Store
	Logger  *slog.Logger
}

func (w *Worker) Run(ctx context.Context) {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			cfg := w.Config.Snapshot()
			if !cfg.AutoCleanup || cfg.RetentionDays <= 0 {
				continue
			}
			deleted, err := w.PurgeOlderThan(ctx, cfg.RetentionDays)
			if err != nil {
				w.Logger.Error("auto cleanup failed", "err", err)
			} else if deleted > 0 {
				w.Logger.Info("auto cleanup completed", "deleted", deleted, "retention_days", cfg.RetentionDays)
			}
		}
	}
}

func (w *Worker) PurgeOlderThan(ctx context.Context, days int) (int64, error) {
	cutoff := time.Now().AddDate(0, 0, -days).Unix()

	attPaths, _ := w.Queries.ListAttachmentPathsOlderThan(ctx, cutoff)
	for _, p := range attPaths {
		_ = w.Storage.Delete(p)
	}

	rawPaths, _ := w.Queries.ListStoragePathsOlderThan(ctx, cutoff)
	for _, p := range rawPaths {
		if p.Valid {
			_ = w.Storage.Delete(p.String)
		}
	}

	result, err := w.Queries.DeleteMessagesOlderThan(ctx, cutoff)
	if err != nil {
		return 0, err
	}
	deleted, _ := result.RowsAffected()
	return deleted, nil
}
