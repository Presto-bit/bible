-- 设备指纹 → 用户 ID 绑定（PWA 重装后客户端可凭 device_id 找回 user_code）

CREATE TABLE IF NOT EXISTS device_user_bindings (
  device_fingerprint TEXT PRIMARY KEY,
  user_code TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_user_bindings_code
  ON device_user_bindings (user_code);

CREATE UNIQUE INDEX IF NOT EXISTS idx_guest_devices_fingerprint
  ON guest_devices (device_fingerprint)
  WHERE device_fingerprint IS NOT NULL;
