'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import PageBackBar from '@/components/PageBackBar';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { api } from '@/lib/api';

export default function AddFriendPage() {
  useEdgeSwipeBack({ href: '/discover' });
  const router = useRouter();

  const [handle, setHandle] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [donePeer, setDonePeer] = useState<string | null>(null);
  const [doneDm, setDoneDm] = useState<string | null>(null);

  const submit = async () => {
    const h = handle.trim();
    if (!h) return;
    setBusy(true);
    setMsg('');
    setOk(false);
    setDonePeer(null);
    setDoneDm(null);
    try {
      const f = await api.addFriend(h, note);
      const pending = f.pending === true || f.status === 'pending';
      const accepted = f.status === 'accepted' || f.pending === false;
      const peerId = f.to_user_id || f.friend_id || null;
      if (pending) {
        setOk(true);
        setMsg(f.message || '已发送好友申请，对方同意后即可私信。');
        return;
      }
      if (accepted && peerId) {
        setOk(true);
        setMsg(f.message || '已成为好友');
        setDonePeer(peerId);
        try {
          const dm = await api.openDm(peerId);
          setDoneDm(dm.thread_id);
        } catch {
          /* ignore */
        }
        return;
      }
      setOk(true);
      setMsg(f.message || '已发送好友申请');
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      if (detail.includes('已经是好友')) {
        setOk(true);
        setMsg('你们已经是好友');
      } else if (detail.includes('用户不存在') || detail.includes('404')) {
        setMsg('未找到该用户，请核对用户 ID 或用户名');
      } else if (detail.includes('自己')) {
        setMsg('不能添加自己');
      } else {
        setMsg(detail || '添加失败：未找到该用户或服务暂不可用');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="container">
      <header className="page-head">
        <PageBackBar href="/discover" label="发现" />
        <h2 className="page-head-title">加好友</h2>
      </header>
      <p className="muted" style={{ marginBottom: 16 }}>
        输入对方的 8 位用户 ID（或历史 10 位）或用户名，发送好友申请。对方同意后即可私信。
      </p>
      <input
        className="search-input"
        placeholder="用户 ID 或用户名"
        value={handle}
        onChange={(e) => setHandle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void submit()}
      />
      <textarea
        className="group-composer-text"
        rows={2}
        placeholder="申请附言（可选）"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        style={{ marginTop: 12 }}
      />
      <button
        type="button"
        className="btn"
        style={{ width: '100%', marginTop: 14 }}
        disabled={busy || !handle.trim()}
        onClick={() => void submit()}
      >
        {busy ? '发送中…' : '发送好友申请'}
      </button>
      {msg && (
        <p style={{ marginTop: 14, color: ok ? 'var(--accent-deep)' : undefined }}>{msg}</p>
      )}
      {ok ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <button type="button" className="btn" onClick={() => router.push('/discover')}>
            返回消息
          </button>
          {doneDm ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => router.push(`/discover/dm/${doneDm}`)}
            >
              去私信
            </button>
          ) : donePeer ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => router.push(`/discover/friends/${donePeer}`)}
            >
              查看资料
            </button>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
