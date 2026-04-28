-- name: CreateMessage :one
INSERT INTO messages (
    mailbox_id, message_id, from_addr, to_addr, subject,
    received_at, text_body, html_body, size
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
RETURNING *;

-- name: GetMessageByID :one
SELECT * FROM messages WHERE id = ? LIMIT 1;

-- name: ListMessagesByMailbox :many
SELECT
    id, mailbox_id, message_id, from_addr, to_addr, subject,
    received_at, size, is_read
FROM messages
WHERE mailbox_id = ?
ORDER BY received_at DESC
LIMIT ? OFFSET ?;

-- name: ListMessages :many
SELECT
    messages.id, messages.mailbox_id, messages.message_id, messages.from_addr,
    messages.to_addr, messages.subject, messages.received_at, messages.size,
    messages.is_read
FROM messages
JOIN mailboxes ON mailboxes.id = messages.mailbox_id
WHERE
    (? = '' OR lower(messages.from_addr) LIKE ? OR lower(messages.to_addr) LIKE ? OR lower(messages.subject) LIKE ? OR lower(mailboxes.address) LIKE ? OR lower(mailboxes.note) LIKE ?)
    AND (? = 'all' OR (? = 'unread' AND messages.is_read = 0) OR (? = 'read' AND messages.is_read = 1))
ORDER BY messages.received_at DESC
LIMIT ? OFFSET ?;

-- name: CountMessages :one
SELECT COUNT(*)
FROM messages
JOIN mailboxes ON mailboxes.id = messages.mailbox_id
WHERE
    (? = '' OR lower(messages.from_addr) LIKE ? OR lower(messages.to_addr) LIKE ? OR lower(messages.subject) LIKE ? OR lower(mailboxes.address) LIKE ? OR lower(mailboxes.note) LIKE ?)
    AND (? = 'all' OR (? = 'unread' AND messages.is_read = 0) OR (? = 'read' AND messages.is_read = 1));

-- name: CountMessagesByMailbox :one
SELECT COUNT(*) FROM messages WHERE mailbox_id = ?;

-- name: CountUnreadByMailbox :one
SELECT COUNT(*) FROM messages WHERE mailbox_id = ? AND is_read = 0;

-- name: MarkMessageRead :exec
UPDATE messages SET is_read = 1 WHERE id = ?;

-- name: DeleteMessage :exec
DELETE FROM messages WHERE id = ?;
