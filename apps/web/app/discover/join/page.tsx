'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function JoinGroupPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const c = code.trim();
    if (!c) return;
    setBusy(true);
    setMsg('');
    try {
      const g = await api.joinGroup(c);
      router.push(`/discover/group/${g.id}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="container">
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Link href="/discover" className="icon-btn" aria-label="返回">
          ‹
        </Link>
        <h2 style={{ margin: 0, fontSize: 18 }}>邀请码加入</h2>
      </header>
      <p className="muted" style={{ marginBottom: 12 }}>
        输入群主分享的 6 位邀请码，加入共读群。
      </p>
      <input
        className="search-input"
        placeholder="邀请码"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <button
        type="button"
        className="btn"
        style={{ width: '100%', marginTop: 14 }}
        disabled={busy || !code.trim()}
        onClick={submit}
      >
        {busy ? '加入中…' : '加入群'}
      </button>
      {msg && <p style={{ marginTop: 14, color: 'var(--ink-faint)' }}>{msg}</p>}
    </main>
  );
}
