'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import PageBackBar from '@/components/PageBackBar';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { api, effectiveId, ensureAccountReady } from '@/lib/api';
import { markLocalDataCreated } from '@/lib/account_guide';
import { stashCreatedGroup } from '@/lib/groups_refresh';
import { recordGroupCreated } from '@/lib/badge_events';
import { GROUP_INACTIVE_NOTICE } from '@/lib/group_policy';

export default function CreateGroupPage() {
  useEdgeSwipeBack({ href: '/discover' });
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
      recordGroupCreated();
      stashCreatedGroup({
        id: g.id,
        name: g.name || n,
        join_code: g.join_code,
        role: g.role || 'owner',
      });
      markLocalDataCreated();
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
      <header className="page-head">
        <PageBackBar href="/discover" label="发现" />
        <h2 className="page-head-title">建群</h2>
      </header>
      <input className="search-input" placeholder="群名称" value={name} onChange={(e) => setName(e.target.value)} />
      <input
        className="search-input"
        style={{ marginTop: 10 }}
        placeholder="群简介（可选）"
        value={intro}
        onChange={(e) => setIntro(e.target.value)}
      />
      <p className="muted" style={{ marginTop: 12, fontSize: 13, lineHeight: 1.55 }}>
        {GROUP_INACTIVE_NOTICE}
      </p>
      <p className="muted" style={{ marginTop: 8, fontSize: 13, lineHeight: 1.55 }}>
        群内讨论以圣经正典为信仰依据；请勿组织化传教异端或发布违法内容。消息与附件仅保留近 30 天。
      </p>
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
