'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, effectiveId, ensureAccountReady } from '@/lib/api';
import { GROUP_CHECKIN_DEFAULT_BODY } from '@/lib/group_checkin';

type Tab = 'group' | 'friends';

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
  kind = 'verse',
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

  const shareToFriends = async () => {
    setBusy('friends');
    setErr(null);
    try {
      await api.publishShare({
        ref: verseRef,
        body: message.trim() || refLabel,
        kind: kind === 'thought' ? 'thought' : 'note',
      });
      onDone?.('好友动态');
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
          <p>登录后即可分享到共读群或好友动态。</p>
          <a className="btn" href="/profile">去登录</a>
        </div>
      </div>
    );
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet card share-social-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong>分享</strong>
          <button type="button" className="text-link" onClick={onClose}>关闭</button>
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
            className={`mode-chip ${tab === 'friends' ? 'mode-chip-active' : ''}`}
            onClick={() => setTab('friends')}
          >
            好友动态
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
            <p className="muted">加好友后，分享会出现在好友动态。</p>
            <a className="font-pill" href="/friend/add">加好友</a>
          </div>
        ) : (
          <button
            type="button"
            className="btn"
            disabled={busy !== null}
            onClick={() => void shareToFriends()}
          >
            {busy === 'friends' ? '发布中…' : '发布到好友动态'}
          </button>
        )}
      </div>
    </div>
  );
}
