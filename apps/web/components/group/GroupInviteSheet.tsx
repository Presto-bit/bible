'use client';

import { SheetCloseButton } from '@/components/PageBackBar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type Friend } from '@/lib/api';
import { FriendAvatar } from '@/components/discover/FriendAvatar';
import { friendDisplayName } from '@/lib/friend_label';
import { friendRemarkOrName } from '@/lib/friend_remarks';
import { groupFriendsByLetter } from '@/lib/friend_sort';

type Props = {
  gid: string;
  groupName: string;
  joinCode: string;
  memberUserIds?: string[];
  preselectIds?: string[];
  onClose: () => void;
  onInvited?: (count: number) => void;
};

function friendLabel(f: Friend): string {
  return friendRemarkOrName(f.user_id, friendDisplayName(f));
}

/** 邀请好友：邀请码 + 选中名单 + 好友列表 */
export function GroupInviteSheet({
  gid,
  groupName,
  joinCode,
  memberUserIds = [],
  preselectIds = [],
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
  const code = (joinCode || '').trim().toUpperCase();
  const shareText = `邀请你加入共读群「${groupName}」\n邀请码：${code}\n打开圣经 App → 发现 → 加入群，输入邀请码即可。`;
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

  const inviteCandidates = friends.filter((f) => !memberSet.has(f.user_id));
  const selectedFriends = inviteCandidates.filter((f) => picked.has(f.user_id));
  const letterGroups = groupFriendsByLetter(inviteCandidates);

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
      <div className="sheet card group-invite-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="half-sheet-grab" aria-hidden />
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong>邀请好友</strong>
          <SheetCloseButton onClick={onClose} />
        </div>

        <div className="group-invite-code-card">
          <span className="muted" style={{ fontSize: 12 }}>群邀请码</span>
          <div className="group-invite-code-row">
            <strong className="group-invite-code">{code}</strong>
            <button
              type="button"
              className="font-pill"
              onClick={() => void copyText(code, '邀请码已复制')}
            >
              复制
            </button>
          </div>
          <button
            type="button"
            className="text-link group-invite-copy-text"
            onClick={() => void copyText(shareText, '邀请文案已复制')}
          >
            复制邀请文案
          </button>
        </div>

        {selectedFriends.length > 0 && (
          <div className="group-invite-selected">
            <div className="group-invite-section-label">已选（{selectedFriends.length}）</div>
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
                  >
                    <FriendAvatar friend={f} size={36} />
                    <span className="group-invite-selected-name">{friendLabel(f)}</span>
                    <span className="group-invite-selected-x" aria-hidden>×</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="group-invite-section-label">好友列表</div>
        {loading ? (
          <p className="muted" style={{ fontSize: 13 }}>加载好友…</p>
        ) : inviteCandidates.length === 0 ? (
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
            暂无可邀请的好友。先去加好友，或分享邀请码。
          </p>
        ) : (
          <div className="group-invite-friend-list group-invite-friend-list-full">
            {letterGroups.map((g) => (
              <div key={g.letter}>
                <div className="friends-letter-head">{g.letter}</div>
                {g.items.map((f) => {
                  const selected = picked.has(f.user_id);
                  const isPending = pendingIds.has(f.user_id);
                  const inGroup = memberSet.has(f.user_id);
                  return (
                    <button
                      key={f.user_id}
                      type="button"
                      className={`group-invite-friend-row${selected ? ' selected' : ''}${isPending ? ' pending' : ''}`}
                      disabled={busy || inGroup}
                      onClick={() => void togglePick(f)}
                    >
                      <FriendAvatar friend={f} size={38} />
                      <span className="group-invite-friend-name">{friendLabel(f)}</span>
                      <span className="group-invite-friend-state muted">
                        {inGroup ? '已在群' : isPending ? '已邀请' : selected ? '已选' : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          className="btn btn-block"
          disabled={busy || newPickCount === 0}
          onClick={() => void sendInvites()}
          style={{ marginTop: 12 }}
        >
          {busy ? '发送中…' : newPickCount > 0 ? `发送邀请（${newPickCount}）` : '发送邀请'}
        </button>

        {hint && (
          <p className="muted" style={{ fontSize: 12, margin: '10px 0 0', lineHeight: 1.45, textAlign: 'center' }}>
            {hint}
          </p>
        )}
        {err && <p className="group-composer-err" role="alert">{err}</p>}
      </div>
    </div>
  );
}
