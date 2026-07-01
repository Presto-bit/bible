'use client';

import { useEffect, useState } from 'react';
import { currentUserId, loginWithIdentifier, logout } from '@/lib/api';

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [uid, setUid] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setUid(currentUserId());
  }, []);

  const login = async () => {
    if (!identifier.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const id = await loginWithIdentifier(identifier.trim(), password);
      setUid(id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="container">
      <h2 style={{ marginBottom: 8 }}>登录</h2>
      <p className="muted" style={{ marginBottom: 20 }}>
        支持「用户ID」或「用户名 + 密码」登录。免注册即用，登录后数据按用户ID云端同步。
      </p>

      {uid ? (
        <div className="card">
          <p>已登录</p>
          <p className="muted" style={{ marginTop: 6, wordBreak: 'break-all' }}>
            用户ID：{uid}
          </p>
          <button
            className="btn"
            onClick={() => {
              logout();
              setUid(null);
            }}
          >
            退出登录
          </button>
        </div>
      ) : (
        <div className="card">
          <input
            className="book-chip"
            style={{ width: '100%', textAlign: 'left', marginBottom: 12 }}
            placeholder="用户ID（10 位数字）或 用户名"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
          <input
            className="book-chip"
            type="password"
            style={{ width: '100%', textAlign: 'left', marginBottom: 12 }}
            placeholder="密码（用户ID登录可留空）"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') login();
            }}
          />
          {err && <p style={{ color: '#b1554a', marginBottom: 10 }}>{err}</p>}
          <button className="btn" style={{ marginTop: 0 }} onClick={login} disabled={busy}>
            {busy ? '登录中…' : '登录'}
          </button>
        </div>
      )}
    </main>
  );
}
