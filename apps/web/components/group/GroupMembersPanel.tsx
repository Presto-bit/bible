'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, type GroupMember } from '@/lib/api';

type Props = {
  gid: string;
  members: GroupMember[];
  isOwner: boolean;
  joinCode?: string;
  planDaysTotal?: number;
  onChanged: () => void;
};

export function GroupMembersPanel({
  gid,
  members,
  isOwner,
  joinCode,
  planDaysTotal,
  onChanged,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const me = members.find((m) => m.is_me);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const removeMember = (m: GroupMember) => {
    if (!window.confirm(`确定将「${m.name || '成员'}」移出群？`)) return;
    void run(`rm-${m.user_id}`, async () => {
      await api.removeGroupMember(gid, m.user_id!);
    });
  };

  const transferTo = (m: GroupMember) => {
    if (!window.confirm(`确定将群主转让给「${m.name || '成员'}」？转让后你将成为普通成员。`)) return;
    void run(`xfer-${m.user_id}`, async () => {
      await api.transferGroup(gid, m.user_id!);
    });
  };

  const leave = () => {
    if (!window.confirm('确定退出此共读群？')) return;
    void run('leave', async () => {
      await api.removeGroupMember(gid, me!.user_id!);
      router.push('/discover');
    });
  };

  return (
    <div className="group-members-panel card card-2">
      <div className="section-row" style={{ marginBottom: 8 }}>
        <strong>成员 · {members.length}</strong>
        {joinCode && isOwner && (
          <span className="muted" style={{ fontSize: 12 }}>邀请码 {joinCode}</span>
        )}
      </div>

      {members.map((m) => (
        <div key={m.user_id} className="group-member-row">
          <div className="group-member-info">
            <span>{m.name || '成员'}{m.is_me ? '（我）' : ''}</span>
            <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>
              {m.checked_in_today ? '今日已打卡 ✓' : '今日未打卡'}
              {planDaysTotal && planDaysTotal > 0 && (m.plan_day ?? 0) > 0
                ? ` · 第 ${m.plan_day}/${planDaysTotal} 天`
                : planDaysTotal && planDaysTotal > 0
                  ? ' · 未开始计划'
                  : ''}
            </span>
          </div>
          <div className="group-member-actions">
            {m.role === 'owner' && <span className="rail-cta">群主</span>}
            {isOwner && m.role !== 'owner' && m.user_id && (
              <>
                <button
                  type="button"
                  className="text-link"
                  disabled={busy !== null}
                  onClick={() => transferTo(m)}
                >
                  {busy === `xfer-${m.user_id}` ? '…' : '转让群主'}
                </button>
                <button
                  type="button"
                  className="text-link danger"
                  disabled={busy !== null}
                  onClick={() => removeMember(m)}
                >
                  {busy === `rm-${m.user_id}` ? '…' : '移除'}
                </button>
              </>
            )}
          </div>
        </div>
      ))}

      {err && <p className="group-composer-err" role="alert">{err}</p>}

      {!isOwner && me?.user_id && (
        <button
          type="button"
          className="font-pill danger-pill"
          style={{ marginTop: 12, width: '100%' }}
          disabled={busy !== null}
          onClick={leave}
        >
          {busy === 'leave' ? '退出中…' : '退出群'}
        </button>
      )}
    </div>
  );
}
