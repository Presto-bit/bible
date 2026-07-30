'use client';

import { SheetCloseButton } from '@/components/PageBackBar';
import { useCallback, useEffect, useState } from 'react';
import { api, effectiveId } from '@/lib/api';
import { GROUP_CHECKIN_DEFAULT_BODY } from '@/lib/group_checkin';
import { friendDisplayName } from '@/lib/friend_label';
import { friendRemarkOrName } from '@/lib/friend_remarks';

type Tab = 'group' | 'dm';
type ShareMode = 'verse' | 'checkin';

type CacheBundle = {
  at: number;
  groups: Awaited<ReturnType<typeof api.myGroups>>['groups'];
  friends: Awaited<ReturnType<typeof api.friends>>['friends'];
};

let shareTargetsCache: CacheBundle | null = null;
const SHARE_CACHE_TTL_MS = 60_000;

type Props = {
  ref: string;
  refLabel: string;
  body?: string;
  kind?: 'thought' | 'verse' | 'note' | 'analysis';
  /** 群默认：发经文卡；可选打卡 */
  defaultGroupMode?: ShareMode;
  onClose: () => void;
  onDone?: (target: string) => void;
};

export function ShareToSocialSheet({
  ref: verseRef,
  refLabel,
  body,
  kind = 'verse',
  defaultGroupMode = 'verse',
  onClose,
  onDone,
}: Props) {
  const isAnalysis = kind === 'analysis';
  const canVerseCard =
    Boolean(verseRef?.trim()) &&
    verseRef !== 'FREE' &&
    verseRef !== '小爱的解读';
  const [tab, setTab] = useState<Tab>('group');
  const [groupMode, setGroupMode] = useState<ShareMode>(
    isAnalysis ? 'verse' : defaultGroupMode,
  );
  const [groups, setGroups] = useState<Awaited<ReturnType<typeof api.myGroups>>['groups']>(
    () => shareTargetsCache?.groups || [],
  );
  const [friends, setFriends] = useState<Awaited<ReturnType<typeof api.friends>>['friends']>(
    () => shareTargetsCache?.friends || [],
  );
  const [message, setMessage] = useState(body || '');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const uid = effectiveId();

  const reload = useCallback(async () => {
    const now = Date.now();
    if (shareTargetsCache && now - shareTargetsCache.at < SHARE_CACHE_TTL_MS) {
      setGroups(shareTargetsCache.groups);
      setFriends(shareTargetsCache.friends);
      setErr(null);
      return;
    }
    try {
      const [g, f] = await Promise.all([api.myGroups(), api.friends()]);
      shareTargetsCache = { at: Date.now(), groups: g.groups, friends: f.friends };
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
      if (!isAnalysis && groupMode === 'checkin') {
        await api.checkin(gid, {
          ref: verseRef,
          body: message.trim() || GROUP_CHECKIN_DEFAULT_BODY,
        });
      } else if (isAnalysis && !canVerseCard) {
        const text = (message.trim() || refLabel).slice(0, 2000);
        await api.sendGroupChat(gid, text);
      } else {
        await api.sendGroupVerse(gid, {
          ref: canVerseCard ? verseRef : verseRef || 'FREE',
          body: message.trim() || undefined,
        });
      }
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
      if (isAnalysis && !canVerseCard) {
        await api.sendDm(dm.thread_id, {
          kind: 'chat',
          body: (message.trim() || refLabel).slice(0, 2000),
        });
      } else {
        await api.sendDm(dm.thread_id, {
          kind: 'verse',
          ref: canVerseCard ? verseRef : verseRef || 'FREE',
          body: message.trim() || refLabel,
        });
      }
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
      <div
        className="sheet-backdrop"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <div className="sheet card" onClick={(e) => e.stopPropagation()}>
          <p>本机账号就绪后即可分享到共读群或私信好友。</p>
          <a className="btn" href="/profile">前往我的</a>
        </div>
      </div>
    );
  }

  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="sheet card share-social-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong>{isAnalysis ? '分享解读' : '分享经文'}</strong>
          <SheetCloseButton onClick={onClose} />
        </div>
        <p className="muted" style={{ fontSize: 12 }}>{refLabel}</p>
        <textarea
          className="group-composer-text"
          rows={isAnalysis ? 4 : 2}
          placeholder={isAnalysis ? '分享文案（可改）' : '附言（可选）'}
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
        {tab === 'group' && !isAnalysis ? (
          <div className="reader-tools-tabs" style={{ marginTop: 8 }}>
            <button
              type="button"
              className={`mode-chip ${groupMode === 'verse' ? 'mode-chip-active' : ''}`}
              onClick={() => setGroupMode('verse')}
            >
              发经文卡
            </button>
            <button
              type="button"
              className={`mode-chip ${groupMode === 'checkin' ? 'mode-chip-active' : ''}`}
              onClick={() => setGroupMode('checkin')}
            >
              打卡分享
            </button>
          </div>
        ) : null}
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
                  <span className="muted">
                    {busy === g.id
                      ? '发送中…'
                      : isAnalysis
                        ? '分享 ›'
                        : groupMode === 'checkin'
                          ? '打卡分享 ›'
                          : '发经文 ›'}
                  </span>
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
