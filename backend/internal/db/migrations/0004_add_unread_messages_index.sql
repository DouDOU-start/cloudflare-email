-- +goose Up
-- +goose StatementBegin
CREATE INDEX idx_messages_unread_received ON messages(is_read, received_at DESC);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_messages_unread_received;
-- +goose StatementEnd
