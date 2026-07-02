-- 手机号绑定（换机恢复，登录 identifier 支持手机号 + 密码）

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS accounts_phone_uq
  ON accounts (phone) WHERE phone IS NOT NULL;
