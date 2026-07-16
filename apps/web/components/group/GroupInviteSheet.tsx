'use client';

import { SheetCloseButton } from '@/components/PageBackBar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type Friend } from '@/lib/api';
import { FriendAvatar } from '@/components/discover/FriendAvatar';
import { friendDisplayName } from '@/lib/friend_label';
import { friendRemarkOrName } from '@/lib/friend_remarks';
import { groupFriendsByLetter } from '@/lib/friend_sort';
import {
  buildGroupInviteShareText,
  groupInviteCheckinLine,
  groupInviteIntro,
  groupInviteReadingLine,
} from '@/lib/group_invite_card';

type Props = {
  gid: string;
  groupName: string;
  joinCode: string;
  memberUserIds?: string[];
  preselectIds?: string[];
  intro?: string | null;
  planTitle?: string | null;
  planDayLine?: string | null;
  checkedInToday?: number;
  memberTotal?: number;
  onClose: () => void;
  onInvited?: (count: number) => void;
};

function friendLabel(f: Friend): string {
  return friendRemarkOrName(f.user_id, friendDisplayName(f));
}

/** 邀请好友：邀请码 + 选中名单 + 好友列表（半屏滚动，底栏固定发送） */
export function GroupInviteSheet({
  gid,
  groupName,
  joinCode,
  memberUserIds = [],
  preselectIds = [],
  intro,
  planTitle,
  planDayLine,
  checkedInToday,
  memberTotal,
  onClose,
  onInvited,
}: Props) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Set<string>>(() => new Set(preselectIds));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hint, setHint] = useState('');
  const [query, setQuery] = useState('');
  const code = (joinCode || '').trim().toUpperCase();
  const shareText = buildGroupInviteShareText({
    groupName,
    intro,
    planTitle,
    planDayLine,
    checkedInToday,
    memberTotal,
    joinCode: code,
  });
  const memberSet = useMemo(() => new Set(memberUserIds), [memberUserIds]);
  const preselectRef = useRef(preselectIds);

  useEffect(() => {
    void Promise.all([api.friends(), api.groupPendingInvites(gid)])
      .then(([fRes, pRes]) => {
        setFriends(fRes.friends);
        const pending = new Set(pRes.friend_ids);
        setPendingIds(pending);
        setPicked(() => {
          const next = new Set<string>();
          for (const id of preselectRef.current) next.add(id);
          for (const id of pending) next.add(id);
          return next;
        });
      })
      .catch(() => setFriends([]))
      .finally(() => setLoading(false));
  }, [gid]);

  const inviteCandidates = useMemo(
    () => friends.filter((f) => !memberSet.has(f.user_id)),
    [friends, memberSet],
  );

  const filteredCandidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return inviteCandidates;
    return inviteCandidates.filter((f) => {
      const name = friendLabel(f).toLowerCase();
      const handle = (f.handle || '').toLowerCase();
      return name.includes(q) || handle.includes(q);
    });
  }, [inviteCandidates, query]);

  const selectedFriends = inviteCandidates.filter((f) => picked.has(f.user_id));
  const letterGroups = groupFriendsByLetter(filteredCandidates);

  const togglePick = async (f: Friend) => {
    const id = f.user_id;
    if (memberSet.has(id)) return;

    if (pendingIds.has(id)) {
      setBusy(true);
      setErr(null);
      try {
        await api.cancelGroupInvite(gid, id);
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setPicked((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setHint(`已取消对「${friendLabel(f)}」的邀请`);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
      return;
    }

    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sendInvites = async () => {
    const ids = [...picked].filter((id) => !pendingIds.has(id) && !memberSet.has(id));
    if (!ids.length || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.sendGroupInvites(gid, ids);
      onInvited?.(r.sent);
      const nextPending = new Set(pendingIds);
      for (const id of ids) nextPending.add(id);
      setPendingIds(nextPending);
      setHint(r.sent > 0 ? `已发送 ${r.sent} 条邀请，等待好友确认` : '所选好友已在群内或已邀请');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (text: string, okMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setHint(okMsg);
    } catch {
      setHint('复制失败，请长按邀请码手动复制');
    }
  };

  const newPickCount = [...picked].filter((id) => !pendingIds.has(id) && !memberSet.has(id)).length;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet card group-invite-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="邀请好友"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="half-sheet-grab" aria-hidden />
        <div className="group-invite-sheet-head">
          <strong>邀请好友</strong>
          <SheetCloseButton onClick={onClose} />
        </div>

        <div className="group-invite-sheet-scroll">
          <div className="group-invite-preview-card">
            <strong className="group-invite-preview-name">{groupName}</strong>
            <p className="group-invite-preview-intro">{groupInviteIntro(intro)}</p>
            <p className="group-invite-preview-line">
              <span className="muted">本周在读</span>
              {groupInviteReadingLine({ groupName, joinCode: code, planTitle, planDayLine })}
            </p>
            <p className="group-invite-preview-line">
              <span className="muted">今日打卡</span>
              {groupInviteCheckinLine({
                groupName,
                joinCode: code,
                checkedInToday,
                memberTotal,
              })}
            </p>
            <div className="group-invite-preview-code">
              <span className="muted">邀请码</span>
              <strong>{code}</strong>
            </div>
          </div>

          <div className="group-invite-code-card">
            <div className="group-invite-code-actions" style={{ marginTop: 0 }}>
              <button
                type="button"
                className="font-pill"
                onClick={() => void copyText(code, '邀请码已复制')}
              >
                复制码
              </button>
              <button
                type="button"
                className="font-pill accent"
                onClick={() => void copyText(shareText, '邀请文案已复制')}
              >
                复制邀请卡
              </button>
            </div>
          </div>

          {selectedFriends.length > 0 ? (
            <div className="group-invite-selected">
              <div className="group-invite-section-label">
                已选 {selectedFriends.length} 人
              </div>
              <div className="group-invite-selected-track">
                {selectedFriends.map((f) => {
                  const isPending = pendingIds.has(f.user_id);
                  return (
                    <button
                      key={f.user_id}
                      type="button"
                      className={`group-invite-selected-chip${isPending ? ' pending' : ''}`}
                      disabled={busy}
                      onClick={() => void togglePick(f)}
                      aria-label={isPending ? `取消邀请 ${friendLabel(f)}` : `取消选择 ${friendLabel(f)}`}
                    >
                      <FriendAvatar friend={f} size={36} />
                      <span className="group-invite-selected-name">{friendLabel(f)}</span>
                      <span className="group-invite-selected-x" aria-hidden>×</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="group-invite-search">
            <input
              className="search-input"
              value={query}
              placeholder="搜索好友"
              onChange={(e) => setQuery(e.target.value)}
              enterKeyHint="search"
            />
          </div>

          <div className="group-invite-section-label">好友列表</div>
          {loading ? (
            <p className="muted group-invite-empty">加载好友…</p>
          ) : inviteCandidates.length === 0 ? (
            <p className="muted group-invite-empty">
              暂无可邀请的好友。先去加好友，或分享上方邀请码。
            </p>
          ) : filteredCandidates.length === 0 ? (
            <p className="muted group-invite-empty">无匹配好友</p>
          ) : (
            <div className="group-invite-friend-list group-invite-friend-list-full">
              {letterGroups.map((g) => (
                <div key={g.letter} className="group-invite-letter-block">
                  <div className="friends-letter-head">{g.letter}</div>
                  {g.items.map((f) => {
                    const selected = picked.has(f.user_id);
                    const isPending = pendingIds.has(f.user_id);
                    return (
                      <button
                        key={f.user_id}
                        type="button"
                        className={`group-invite-friend-row${selected ? ' selected' : ''}${isPending ? ' pending' : ''}`}
                        disabled={busy}
                        onClick={() => void togglePick(f)}
                      >
                        <FriendAvatar friend={f} size={40} />
                        <span className="group-invite-friend-name">{friendLabel(f)}</span>
                        <span className={`group-invite-friend-check${selected ? ' is-on' : ''}`} aria-hidden>
                          {isPending ? '已邀' : selected ? '✓' : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="group-invite-sheet-foot">
          {hint ? <p className="group-invite-hint muted">{hint}</p> : null}
          {err ? <p className="group-composer-err" role="alert">{err}</p> : null}
          <button
            type="button"
            className="btn btn-block"
            disabled={busy || newPickCount === 0}
            onClick={() => void sendInvites()}
          >
            {busy ? '发送中…' : newPickCount > 0 ? `发送邀请（${newPickCount}）` : '选择好友后发送'}
          </button>
        </div>
      </div>
    </div>
  );
}
