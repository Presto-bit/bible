-- 免注册账号体系：10 位数字用户ID 为唯一标识，用户名唯一，可选密码。
-- 现有卷已初始化时不会自动重跑：手动 `psql -f` 或 `docker compose exec` 应用。

CREATE TABLE IF NOT EXISTS accounts (
  user_code  TEXT PRIMARY KEY,           -- 10 位数字用户ID（对外唯一标识）
  user_id    UUID NOT NULL,              -- 映射到 users.id（uuid5(user_code)），云端数据归属
  username   TEXT,                       -- 显示名 / 登录名（唯一）
  pwd_hash   TEXT,                        -- sha256(salt + password)，可空（仅 ID 登录）
  pwd_salt   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 用户名全局唯一（忽略空值）
CREATE UNIQUE INDEX IF NOT EXISTS accounts_username_uq
  ON accounts (lower(username)) WHERE username IS NOT NULL;
