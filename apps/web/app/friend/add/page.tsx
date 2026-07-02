'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';

export default function AddFriendPage() {
  const [handle, setHandle] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const h = handle.trim();
    if (!h) return;
    setBusy(true);
    setMsg('');
    try {
      const f = await api.addFriend(h);
      setMsg(`已添加好友：${f.display_name || f.handle || f.user_id}`);
    } catch {
      setMsg('添加失败：未找到该用户或服务暂不可用');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="container">
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Link href="/" className="icon-btn" aria-label="返回">←</Link>
        <h2 style={{ margin: 0, fontSize: 18 }}>加好友</h2>
      </header>
      <p className="muted" style={{ marginBottom: 16 }}>
        输入对方的 8 位用户 ID（或历史 10 位）或用户名，查找后即可添加。
      </p>
      <input
        className="search-input"
        placeholder="用户 ID 或用户名"
        value={handle}
        onChange={(e) => setHandle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <button type="button" className="btn" style={{ width: '100%', marginTop: 14 }} disabled={busy || !handle.trim()} onClick={submit}>
        {busy ? '查找中…' : '查找并添加'}
      </button>
      {msg && <p style={{ marginTop: 14, color: msg.startsWith('已') ? 'var(--accent-deep)' : undefined }}>{msg}</p>}
    </main>
  );
}
