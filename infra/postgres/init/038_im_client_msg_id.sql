-- IM 发送幂等：client_msg_id（防超时重发真双条）
ALTER TABLE direct_message
  ADD COLUMN IF NOT EXISTS client_msg_id TEXT;

ALTER TABLE group_message
  ADD COLUMN IF NOT EXISTS client_msg_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS direct_message_sender_client_msg_uidx
  ON direct_message (sender_id, client_msg_id)
  WHERE client_msg_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS group_message_user_client_msg_uidx
  ON group_message (user_id, client_msg_id)
  WHERE client_msg_id IS NOT NULL;
