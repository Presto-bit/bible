'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageBackBar from '@/components/PageBackBar';
import { api, type GroupInviteInboxItem } from '@/lib/api';
import { recordInviteAccepted } from '@/lib/badge_events';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';

export default function DiscoverInvitesPage() {
  useEdgeSwipeBack({ href: '/discover/contacts' });
  const router = useRouter();
  const [items, setItems] = useState<GroupInviteInboxItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = () => {
    void api
      .groupInviteInbox()
      .then((r) => setItems(r.invites))
      .catch(() => setItems([]))
      .finally(() => setLoaded(true));
  };

  useEffect(() => {
    reload();
  }, []);

  const respond = async (id: string, accept: boolean, groupId?: string) => {
    setBusyId(id);
    try {
      if (accept) {
        const r = await api.acceptGroupInvite(id);
        recordInviteAccepted();
        router.push(`/discover/group/${r.group_id || groupId}`);
        return;
      }
      await api.declineGroupInvite(id);
      reload();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="container">
      <header className="page-head">
        <PageBackBar href="/discover/contacts" label="通讯录" />
        <h2 className="page-head-title">群通知</h2>
      </header>

      {!loaded ? (
        <p className="muted">加载中…</p>
      ) : items.length === 0 ? (
        <div className="discover-empty is-compact">
          <strong>暂无入群邀请</strong>
          <p className="muted">好友邀请你时会出现在这里。</p>
          <div className="discover-empty-actions">
            <Link href="/discover" className="btn">
              返回消息
            </Link>
          </div>
        </div>
      ) : (
        <section className="group-invite-inbox card card-2">
          <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
            确认后即可加入共读群并开始打卡。
          </p>
          {items.map((item) => (
            <div key={item.id} className="group-invite-inbox-card">
              <p style={{ fontSize: 14, margin: 0, lineHeight: 1.5 }}>{item.message}</p>
              <div className="group-invite-inbox-actions">
                <button
                  type="button"
                  className="btn"
                  style={{ flex: 1 }}
                  disabled={busyId === item.id}
                  onClick={() => void respond(item.id, true, item.group_id)}
                >
                  {busyId === item.id ? '处理中…' : '接受加入'}
                </button>
                <button
                  type="button"
                  className="font-pill"
                  style={{ flex: 1 }}
                  disabled={busyId === item.id}
                  onClick={() => void respond(item.id, false)}
                >
                  婉拒
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
