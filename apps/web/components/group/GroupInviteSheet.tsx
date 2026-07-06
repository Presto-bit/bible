'use client';

import { SheetCloseButton } from '@/components/PageBackBar';
import { useEffect, useMemo, useState } from 'react';
import { api, type Friend } from '@/lib/api';

type Props = {
  gid: string;
  groupName: string;
  joinCode: string;
  memberUserIds?: string[];
  onClose: () => void;
  onInvited?: (count: number) => void;
};

function isWeChatBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /MicroMessenger/i.test(navigator.userAgent);
}

function friendLabel(f: Friend): string {
  return (f.display_name || f.handle || f.user_id.slice(0, 6)).trim();
}

/** 邀请好友：勾选好友发送邀请 / 或复制邀请码 */
export function GroupInviteSheet({
  gid,
  groupName,
  joinCode,
  memberUserIds = [],
  onClose,
  onInvited,
}: Props) {
  const [tab, setTab] = useState<'friends' | 'code'>('friends');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hint, setHint] = useState('');
  const code = (joinCode || '').trim().toUpperCase();
  const shareText = `邀请你加入共读群「${groupName}」\n邀请码：${code}\n打开圣经 App → 发现 → 加入群，输入邀请码即可。`;
  const inWeChat = isWeChatBrowser();
  const memberSet = useMemo(() => new Set(memberUserIds), [memberUserIds]);

  useEffect(() => {
    void api
      .friends()
      .then((r) => setFriends(r.friends))
      .catch(() => setFriends([]))
      .finally(() => setLoading(false));
  }, []);

  const inviteCandidates = friends.filter((f) => !memberSet.has(f.user_id));

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sendInvites = async () => {
    const ids = [...picked];
    if (!ids.length || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.sendGroupInvites(gid, ids);
      onInvited?.(r.sent);
      setHint(r.sent > 0 ? `已发送 ${r.sent} 条邀请，等待好友确认` : '所选好友已在群内或已邀请');
      setPicked(new Set());
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

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet card group-invite-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="half-sheet-grab" aria-hidden />
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong>邀请好友</strong>
          <SheetCloseButton onClick={onClose} />
        </div>

        <div className="group-invite-tabs">
          <button
            type="button"
            className={`font-pill${tab === 'friends' ? ' accent' : ''}`}
            onClick={() => setTab('friends')}
          >
            我的好友
          </button>
          <button
            type="button"
            className={`font-pill${tab === 'code' ? ' accent' : ''}`}
            onClick={() => setTab('code')}
          >
            邀请码
          </button>
        </div>

        {tab === 'friends' ? (
          <>
            <p className="muted" style={{ fontSize: 13, margin: '0 0 4px', lineHeight: 1.5 }}>
              勾选好友并发送邀请；对方确认后将加入「{groupName}」。
            </p>
            {loading ? (
              <p className="muted" style={{ fontSize: 13 }}>加载好友…</p>
            ) : inviteCandidates.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>
                暂无可邀请的好友。先去加好友，或改用邀请码。
              </p>
            ) : (
              <div className="group-invite-friend-list">
                {inviteCandidates.map((f) => (
                  <button
                    key={f.user_id}
                    type="button"
                    className={`group-invite-friend-row${picked.has(f.user_id) ? ' selected' : ''}`}
                    onClick={() => toggle(f.user_id)}
                  >
                    <input type="checkbox" readOnly checked={picked.has(f.user_id)} />
                    <span>{friendLabel(f)}</span>
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              className="btn btn-block"
              disabled={busy || picked.size === 0}
              onClick={() => void sendInvites()}
            >
              {busy ? '发送中…' : `邀请${picked.size > 0 ? `（${picked.size}）` : ''}`}
            </button>
          </>
        ) : (
          <>
            <p className="muted" style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.5 }}>
              {inWeChat
                ? '复制邀请码或文案，通过微信发给朋友。'
                : '也可复制邀请码，发给尚未加好友的读者。'}
            </p>
            <div className="group-invite-code-card">
              <span className="muted" style={{ fontSize: 12 }}>群邀请码</span>
              <strong className="group-invite-code">{code}</strong>
            </div>
            <div className="group-invite-actions">
              <button type="button" className="btn btn-block" onClick={() => void copyText(code, '邀请码已复制')}>
                复制邀请码
              </button>
              <button
                type="button"
                className="half-sheet-action-btn"
                style={{ width: '100%', marginTop: 10 }}
                onClick={() => void copyText(shareText, '邀请文案已复制')}
              >
                复制邀请文案
              </button>
            </div>
          </>
        )}

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
