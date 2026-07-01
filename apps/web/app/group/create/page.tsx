'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';

export default function CreateGroupPage() {
  const [name, setName] = useState('');
  const [intro, setIntro] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    setMsg('');
    try {
      const g = await api.createGroup(n, intro.trim() || undefined);
      setMsg(`已建群：${g.name} · 邀请码 ${g.join_code}`);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      setMsg(detail.includes('未登录') || detail.includes('未认证')
        ? '建群失败：请先完成账号引导（我的 → 设置用户名）'
        : `建群失败：${detail}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="container">
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Link href="/" className="icon-btn" aria-label="返回">←</Link>
        <h2 style={{ margin: 0, fontSize: 18 }}>建群</h2>
      </header>
      <input className="search-input" placeholder="群名称" value={name} onChange={(e) => setName(e.target.value)} />
      <input
        className="search-input"
        style={{ marginTop: 10 }}
        placeholder="群简介（可选）"
        value={intro}
        onChange={(e) => setIntro(e.target.value)}
      />
      <button type="button" className="btn" style={{ width: '100%', marginTop: 14 }} disabled={busy || !name.trim()} onClick={submit}>
        {busy ? '创建中…' : '创建共读群'}
      </button>
      {msg && <p style={{ marginTop: 14 }}>{msg}</p>}
    </main>
  );
}
