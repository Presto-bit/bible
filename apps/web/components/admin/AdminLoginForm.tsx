'use client';

import { useState } from 'react';
import { adminLogin } from '@/lib/admin_rag';

export function AdminLoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await adminLogin(phone.trim(), password);
      onSuccess();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '登录失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-login-form">
      <p className="settings-title">管理员登录</p>
      <input
        className="search-input"
        style={{ marginBottom: 8 }}
        placeholder="手机号"
        inputMode="tel"
        autoComplete="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <input
        className="search-input"
        type="password"
        style={{ marginBottom: 8 }}
        placeholder="密码"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button type="button" className="btn" style={{ width: '100%' }} disabled={busy} onClick={() => void submit()}>
        {busy ? '登录中…' : '登录'}
      </button>
      {err ? <p className="admin-rag-error-text" style={{ marginTop: 8 }}>{err}</p> : null}
    </div>
  );
}
