'use client';

import { SheetCloseButton } from '@/components/PageBackBar';
import { useCallback, useEffect, useState } from 'react';
import { api, effectiveId } from '@/lib/api';
import { GROUP_CHECKIN_DEFAULT_BODY } from '@/lib/group_checkin';
import { friendDisplayName } from '@/lib/friend_label';
import { friendRemarkOrName } from '@/lib/friend_remarks';

type Tab = 'group' | 'dm';

type Props = {
  ref: string;
  refLabel: string;
  body?: string;
  kind?: 'thought' | 'verse' | 'note';
  onClose: () => void;
  onDone?: (target: string) => void;
};

export function ShareToSocialSheet({
  ref: verseRef,
  refLabel,
  body,
  kind: _kind = 'verse',
  onClose,
  onDone,
}: Props) {
  const [tab, setTab] = useState<Tab>('group');
  const [groups, setGroups] = useState<Awaited<ReturnType<typeof api.myGroups>>['groups']>([]);
  const [friends, setFriends] = useState<Awaited<ReturnType<typeof api.friends>>['friends']>([]);
  const [message, setMessage] = useState(body || '');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const uid = effectiveId();

  const reload = useCallback(async () => {
    try {
      const [g, f] = await Promise.all([api.myGroups(), api.friends()]);
      setGroups(g.groups);
      setFriends(f.friends);
      setErr(null);
    } catch (e) {
      setErr(String(e));
    }
  }, []);

  useEffect(() => {
    if (uid) reload();
  }, [uid, reload]);

  const shareToGroup = async (gid: string, name: string) => {
    setBusy(gid);
    setErr(null);
    try {
      await api.checkin(gid, {
        ref: verseRef,
        body: message.trim() || GROUP_CHECKIN_DEFAULT_BODY,
      });
      onDone?.(name);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const shareToDm = async (peerId: string, label: string) => {
    setBusy(peerId);
    setErr(null);
    try {
      const dm = await api.openDm(peerId);
      await api.sendDm(dm.thread_id, {
        kind: 'verse',
        ref: verseRef,
        body: message.trim() || refLabel,
      });
      onDone?.(label);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (!uid) {
    return (
      <div className="sheet-backdrop" onClick={onClose}>
        <div className="sheet card" onClick={(e) => e.stopPropagation()}>
          <p>本机账号就绪后即可分享到共读群或私信好友。</p>
          <a className="btn" href="/profile">前往我的</a>
        </div>
      </div>
    );
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet card share-social-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong>分享</strong>
          <SheetCloseButton onClick={onClose} />
        </div>
        <p className="muted" style={{ fontSize: 12 }}>{refLabel}</p>
        <textarea
          className="group-composer-text"
          rows={2}
          placeholder="附言（可选）"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <div className="reader-tools-tabs">
          <button
            type="button"
            className={`mode-chip ${tab === 'group' ? 'mode-chip-active' : ''}`}
            onClick={() => setTab('group')}
          >
            共读群
          </button>
          <button
            type="button"
            className={`mode-chip ${tab === 'dm' ? 'mode-chip-active' : ''}`}
            onClick={() => setTab('dm')}
          >
            私信好友
          </button>
        </div>
        {err && <p className="group-composer-err">{err}</p>}
        {tab === 'group' ? (
          groups.length === 0 ? (
            <p className="muted">还没有共读群，先去发现页创建或加入。</p>
          ) : (
            <div className="share-target-list">
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className="share-target-row"
                  disabled={busy !== null}
                  onClick={() => void shareToGroup(g.id, g.name)}
                >
                  <span>{g.name}</span>
                  <span className="muted">{busy === g.id ? '发送中…' : '打卡分享 ›'}</span>
                </button>
              ))}
            </div>
          )
        ) : friends.length === 0 ? (
          <div>
            <p className="muted">加好友后，可将经文卡发到私信。</p>
            <a className="font-pill" href="/friend/add">加好友</a>
          </div>
        ) : (
          <div className="share-target-list">
            {friends.map((f) => {
              const label = friendRemarkOrName(f.user_id, friendDisplayName(f));
              return (
                <button
                  key={f.user_id}
                  type="button"
                  className="share-target-row"
                  disabled={busy !== null}
                  onClick={() => void shareToDm(f.user_id, label)}
                >
                  <span>{label}</span>
                  <span className="muted">
                    {busy === f.user_id ? '发送中…' : '发私信 ›'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
