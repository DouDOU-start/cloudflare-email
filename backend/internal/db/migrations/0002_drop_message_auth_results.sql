-- +goose Up
-- +goose StatementBegin
ALTER TABLE messages DROP COLUMN spf_pass;
ALTER TABLE messages DROP COLUMN dkim_pass;
ALTER TABLE messages DROP COLUMN dmarc_pass;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE messages ADD COLUMN spf_pass INTEGER;
ALTER TABLE messages ADD COLUMN dkim_pass INTEGER;
ALTER TABLE messages ADD COLUMN dmarc_pass INTEGER;
-- +goose StatementEnd
