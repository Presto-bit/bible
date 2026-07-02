'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { currentUserId, loginWithIdentifier, logout } from '@/lib/api';

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [uid, setUid] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setUid(currentUserId());
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    const u = q.get('u') || q.get('id') || '';
    if (u) setIdentifier(u);
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
      <h2 style={{ marginBottom: 8 }}>恢复账号</h2>
      <p className="muted" style={{ marginBottom: 20, lineHeight: 1.5 }}>
        在新设备上输入<strong>用户名 + 密码</strong>即可找回笔记与进度。也支持手机号或用户 ID 登录。
      </p>

      {uid ? (
        <div className="card">
          <p>已恢复到此账号</p>
          <p className="muted" style={{ marginTop: 6, wordBreak: 'break-all' }}>
            用户 ID：{uid}
          </p>
          <Link href="/profile" className="btn" style={{ display: 'inline-block', marginTop: 12, textAlign: 'center' }}>
            返回我的
          </Link>
          <button
            className="logout-btn"
            style={{ marginTop: 12 }}
            onClick={() => {
              logout();
              setUid(null);
            }}
          >
            切换其他账号
          </button>
        </div>
      ) : (
        <div className="card">
          <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>推荐：用户名 + 密码</p>
          <input
            className="book-chip"
            style={{ width: '100%', textAlign: 'left', marginBottom: 12 }}
            placeholder="用户名 / 手机号 / 用户 ID"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
          <input
            className="book-chip"
            type="password"
            style={{ width: '100%', textAlign: 'left', marginBottom: 12 }}
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') login();
            }}
          />
          {err && <p style={{ color: '#b1554a', marginBottom: 10 }}>{err}</p>}
          <button className="btn" style={{ marginTop: 0 }} onClick={() => void login()} disabled={busy}>
            {busy ? '恢复中…' : '恢复账号'}
          </button>
          <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
            日常在本机使用无需此步骤，数据会自动云端备份。
          </p>
        </div>
      )}
    </main>
  );
}
