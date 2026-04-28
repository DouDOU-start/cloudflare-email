-- name: CreateToken :one
INSERT INTO tokens (mailbox_id, token_hash, plain_token, name, expires_at, created_at)
VALUES (?, ?, ?, ?, ?, ?)
RETURNING *;

-- name: GetTokenByHash :one
SELECT * FROM tokens WHERE token_hash = ? LIMIT 1;

-- name: ListTokensByMailbox :many
SELECT * FROM tokens WHERE mailbox_id = ? ORDER BY created_at DESC;

-- name: ListAllTokens :many
SELECT t.*, m.address AS mailbox_address
FROM tokens t
JOIN mailboxes m ON m.id = t.mailbox_id
ORDER BY t.created_at DESC;

-- name: GetTokenWithMailbox :one
SELECT t.*, m.address AS mailbox_address
FROM tokens t
JOIN mailboxes m ON m.id = t.mailbox_id
WHERE t.id = ? LIMIT 1;

-- name: ResetTokenSecret :one
UPDATE tokens
SET token_hash = ?, plain_token = ?, revoked_at = NULL, last_used_at = NULL
WHERE id = ?
RETURNING *;

-- name: RevokeToken :exec
UPDATE tokens SET revoked_at = ? WHERE id = ?;

-- name: TouchTokenUsed :exec
UPDATE tokens SET last_used_at = ? WHERE id = ?;

-- name: DeleteToken :exec
DELETE FROM tokens WHERE id = ?;
