-- 群邀请：好友需确认后加入
CREATE TABLE IF NOT EXISTS group_invite (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES social_group(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES users(id),
  invitee_id UUID NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  UNIQUE (group_id, invitee_id)
);
CREATE INDEX IF NOT EXISTS group_invite_invitee_idx ON group_invite (invitee_id, status);
