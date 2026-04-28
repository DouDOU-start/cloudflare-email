-- name: CreateAttachment :one
INSERT INTO attachments (message_id, filename, content_type, size, storage_path)
VALUES (?, ?, ?, ?, ?)
RETURNING *;

-- name: ListAttachmentsByMessage :many
SELECT * FROM attachments WHERE message_id = ? ORDER BY id;

-- name: GetAttachmentByID :one
SELECT * FROM attachments WHERE id = ? LIMIT 1;
