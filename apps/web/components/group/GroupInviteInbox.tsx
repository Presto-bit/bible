'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type GroupInviteInboxItem } from '@/lib/api';

type Props = {
  onChanged?: () => void;
};

export function GroupInviteInbox({ onChanged }: Props) {
  const [items, setItems] = useState<GroupInviteInboxItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = () => {
    void api.groupInviteInbox().then((r) => setItems(r.invites)).catch(() => setItems([]));
  };

  useEffect(() => {
    reload();
  }, []);

  if (!items.length) return null;

  const respond = async (id: string, accept: boolean) => {
    setBusyId(id);
    try {
      if (accept) await api.acceptGroupInvite(id);
      else await api.declineGroupInvite(id);
      reload();
      onChanged?.();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="group-invite-inbox card card-2">
      <strong style={{ fontSize: 14 }}>群邀请</strong>
      <p className="muted" style={{ fontSize: 12, margin: '4px 0 10px' }}>
        好友邀请你加入共读群，确认后即可开始打卡。
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
              onClick={() => void respond(item.id, true)}
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
            <Link href={`/discover/group/${item.group_id}`} className="font-pill">
              预览
            </Link>
          </div>
        </div>
      ))}
    </section>
  );
}
