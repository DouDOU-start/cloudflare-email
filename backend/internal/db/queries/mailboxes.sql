-- name: GetMailboxByAddress :one
SELECT * FROM mailboxes WHERE address = ? LIMIT 1;

-- name: GetMailboxByID :one
SELECT * FROM mailboxes WHERE id = ? LIMIT 1;

-- name: CreateMailbox :one
INSERT INTO mailboxes (address, note, auto_created, created_at)
VALUES (?, ?, ?, ?)
RETURNING *;

-- name: ListMailboxes :many
SELECT
    m.*,
    (SELECT COUNT(*) FROM messages WHERE mailbox_id = m.id) AS message_count,
    (SELECT COUNT(*) FROM messages WHERE mailbox_id = m.id AND is_read = 0) AS unread_count,
    CAST((SELECT COALESCE(MAX(received_at), 0) FROM messages WHERE mailbox_id = m.id) AS INTEGER) AS last_received_at
FROM mailboxes m
ORDER BY last_received_at DESC, m.created_at DESC;

-- name: UpdateMailboxNote :exec
UPDATE mailboxes SET note = ? WHERE id = ?;

-- name: DeleteMailbox :exec
DELETE FROM mailboxes WHERE id = ?;
