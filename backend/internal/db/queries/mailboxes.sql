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
    m.id, m.address, m.note, m.auto_created, m.created_at,
    CAST(COUNT(msg.id) AS INTEGER) AS message_count,
    CAST(COUNT(CASE WHEN msg.is_read = 0 THEN 1 END) AS INTEGER) AS unread_count,
    CAST(COALESCE(MAX(msg.received_at), 0) AS INTEGER) AS last_received_at
FROM mailboxes m
LEFT JOIN messages msg ON msg.mailbox_id = m.id
GROUP BY m.id
ORDER BY last_received_at DESC, m.created_at DESC;

-- name: UpdateMailboxNote :exec
UPDATE mailboxes SET note = ? WHERE id = ?;

-- name: DeleteMailbox :exec
DELETE FROM mailboxes WHERE id = ?;
