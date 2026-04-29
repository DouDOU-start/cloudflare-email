-- +goose Up
-- +goose StatementBegin
ALTER TABLE messages ADD COLUMN raw_storage_path TEXT;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE messages DROP COLUMN raw_storage_path;
-- +goose StatementEnd
