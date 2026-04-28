-- +goose Up
-- +goose StatementBegin
ALTER TABLE tokens ADD COLUMN plain_token TEXT;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE tokens DROP COLUMN plain_token;
-- +goose StatementEnd
