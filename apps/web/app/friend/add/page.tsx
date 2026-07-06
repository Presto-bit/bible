'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import PageBackBar from '@/components/PageBackBar';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { api } from '@/lib/api';
import { friendDisplayName } from '@/lib/friend_label';

export default function AddFriendPage() {
  useEdgeSwipeBack({ href: '/' });
  const router = useRouter();

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
      const id = f.user_id || (f as { friend_id?: string }).friend_id;
      const label = friendDisplayName({
        user_id: id ?? '',
        display_name: f.display_name,
        handle: f.handle ?? h,
      });
      setMsg(`已添加好友：${label}`);
      if (id) {
        window.setTimeout(() => router.push(`/discover/friends/${id}`), 600);
      }
    } catch {
      setMsg('添加失败：未找到该用户或服务暂不可用');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="container">
      <header className="page-head">
        <PageBackBar href="/" label="首页" />
        <h2 className="page-head-title">加好友</h2>
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
