-- +goose Up
-- +goose StatementBegin

CREATE TABLE login_attempts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ip           TEXT    NOT NULL,
    username     TEXT,
    success      INTEGER NOT NULL,
    attempted_at INTEGER NOT NULL
);
CREATE INDEX idx_login_attempts_ip_time ON login_attempts(ip, attempted_at DESC);

CREATE TABLE mailboxes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    address      TEXT    NOT NULL UNIQUE,
    note         TEXT,
    auto_created INTEGER NOT NULL DEFAULT 1,
    created_at   INTEGER NOT NULL
);

CREATE TABLE messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    mailbox_id  INTEGER NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
    message_id  TEXT,
    from_addr   TEXT    NOT NULL,
    to_addr     TEXT    NOT NULL,
    subject     TEXT,
    received_at INTEGER NOT NULL,
    text_body   TEXT,
    html_body   TEXT,
    size        INTEGER NOT NULL,
    is_read     INTEGER NOT NULL DEFAULT 0,
    spf_pass    INTEGER,
    dkim_pass   INTEGER,
    dmarc_pass  INTEGER
);
CREATE INDEX idx_messages_mailbox_received ON messages(mailbox_id, received_at DESC);
CREATE INDEX idx_messages_received ON messages(received_at DESC);

CREATE TABLE attachments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id   INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    filename     TEXT    NOT NULL,
    content_type TEXT,
    size         INTEGER NOT NULL,
    storage_path TEXT    NOT NULL
);
CREATE INDEX idx_attachments_message ON attachments(message_id);

CREATE TABLE tokens (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    mailbox_id   INTEGER NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
    token_hash   BLOB    NOT NULL UNIQUE,
    name         TEXT,
    expires_at   INTEGER,
    revoked_at   INTEGER,
    created_at   INTEGER NOT NULL,
    last_used_at INTEGER
);
CREATE INDEX idx_tokens_mailbox ON tokens(mailbox_id);


-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS tokens;
DROP TABLE IF EXISTS attachments;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS mailboxes;
DROP TABLE IF EXISTS login_attempts;
-- +goose StatementEnd
