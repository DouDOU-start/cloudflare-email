-- name: RecordLoginAttempt :exec
INSERT INTO login_attempts (ip, username, success, attempted_at)
VALUES (?, ?, ?, ?);

-- name: CountRecentLoginFailures :one
SELECT COUNT(*) FROM login_attempts
WHERE ip = @ip AND success = 0 AND attempted_at >= @attempted_at;
