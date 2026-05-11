-- name: CreateMessage :one
INSERT INTO messages (
    mailbox_id, message_id, from_addr, to_addr, subject,
    received_at, text_body, html_body, size, raw_storage_path
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
RETURNING *;

-- name: GetMessageByID :one
SELECT * FROM messages WHERE id = ? LIMIT 1;

-- name: ListMessagesByMailbox :many
SELECT
    id, mailbox_id, message_id, from_addr, to_addr, subject,
    received_at, size, is_read,
    CAST(COUNT(*) OVER() AS INTEGER) AS total_count
FROM messages
WHERE mailbox_id = ?
ORDER BY received_at DESC
LIMIT ? OFFSET ?;

-- name: ListMessages :many
SELECT
    messages.id, messages.mailbox_id, messages.message_id, messages.from_addr,
    messages.to_addr, messages.subject, messages.received_at, messages.size,
    messages.is_read,
    CAST(COUNT(*) OVER() AS INTEGER) AS total_count
FROM messages
JOIN mailboxes ON mailboxes.id = messages.mailbox_id
WHERE
    (? = '' OR messages.from_addr LIKE ? OR messages.to_addr LIKE ? OR messages.subject LIKE ? OR mailboxes.address LIKE ? OR mailboxes.note LIKE ?)
    AND (? = 'all' OR (? = 'unread' AND messages.is_read = 0) OR (? = 'read' AND messages.is_read = 1))
ORDER BY messages.received_at DESC
LIMIT ? OFFSET ?;

-- name: CountMessagesByMailbox :one
SELECT COUNT(*) FROM messages WHERE mailbox_id = ?;

-- name: CountUnreadByMailbox :one
SELECT COUNT(*) FROM messages WHERE mailbox_id = ? AND is_read = 0;

-- name: MailboxStats :one
SELECT
    CAST(COUNT(*) AS INTEGER) AS message_count,
    CAST(COUNT(CASE WHEN is_read = 0 THEN 1 END) AS INTEGER) AS unread_count
FROM messages WHERE mailbox_id = ?;

-- name: MarkMessageRead :exec
UPDATE messages SET is_read = 1 WHERE id = ?;

-- name: MarkAllMessagesRead :exec
UPDATE messages SET is_read = 1 WHERE is_read = 0;

-- name: MarkMailboxMessagesRead :exec
UPDATE messages SET is_read = 1 WHERE mailbox_id = ? AND is_read = 0;

-- name: FindLatestUnreadMessagesForCode :many
SELECT
    id, mailbox_id, message_id, from_addr, to_addr, subject,
    received_at, text_body, html_body, size, is_read, raw_storage_path
FROM messages
WHERE is_read = 0
  AND lower(to_addr) LIKE ?
  AND lower(from_addr) LIKE ?
ORDER BY received_at DESC
LIMIT ?;

-- name: ListStoragePathsByMailbox :many
SELECT raw_storage_path FROM messages
WHERE mailbox_id = ? AND raw_storage_path IS NOT NULL AND raw_storage_path != '';

-- name: ListStoragePathsOlderThan :many
SELECT raw_storage_path FROM messages
WHERE received_at < ? AND raw_storage_path IS NOT NULL AND raw_storage_path != '';

-- name: DeleteMessagesOlderThan :execresult
DELETE FROM messages WHERE received_at < ?;

-- name: DeleteMessage :exec
DELETE FROM messages WHERE id = ?;
