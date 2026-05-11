-- +goose Up
-- +goose StatementBegin

-- Covering index for ListMailboxes GROUP BY: counts + max(received_at) per mailbox
CREATE INDEX IF NOT EXISTS idx_messages_mailbox_read_received
ON messages(mailbox_id, is_read, received_at DESC);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_messages_mailbox_read_received;
-- +goose StatementEnd
