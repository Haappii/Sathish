ALTER TABLE users
  ADD COLUMN IF NOT EXISTS active_session_id VARCHAR(120),
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

UPDATE users
SET login_status = FALSE,
    active_session_id = NULL
WHERE COALESCE(login_status, FALSE) = TRUE
  AND COALESCE(active_session_id, '') = '';
