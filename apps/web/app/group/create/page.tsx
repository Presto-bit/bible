'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, effectiveId, ensureAccountReady } from '@/lib/api';
import { markGroupsListDirty } from '@/lib/groups_refresh';

export default function CreateGroupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [intro, setIntro] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void ensureAccountReady().then(() => setReady(Boolean(effectiveId())));
  }, []);

  const submit = async () => {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    setMsg('');
    try {
      await ensureAccountReady();
      if (!effectiveId()) throw new Error('身份未就绪');
      const g = await api.createGroup(n, intro.trim() || undefined);
      if (!g?.id) throw new Error('服务器未返回群 ID');
      markGroupsListDirty();
      router.replace(`/discover/group/${encodeURIComponent(g.id)}`);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      setMsg(
        detail.includes('未登录') || detail.includes('未认证') || detail.includes('身份未就绪')
          ? '建群失败：身份未就绪，请返回「我的」刷新后重试'
          : `建群失败：${detail}`,
      );
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
      <button
        type="button"
        className="btn"
        style={{ width: '100%', marginTop: 14 }}
        disabled={busy || !ready || !name.trim()}
        onClick={submit}
      >
        {busy ? '创建中…' : ready ? '创建共读群' : '准备账号…'}
      </button>
      {msg && <p style={{ marginTop: 14 }}>{msg}</p>}
    </main>
  );
}
