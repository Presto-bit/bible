'use client';

/** 微信式选人：搜索 + 最近 + 头像行 + 多选确认（转发/分享共用）。 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { SheetCloseButton } from '@/components/PageBackBar';
import Avatar, { defaultAvatarId } from '@/components/Avatar';
import { FriendAvatar } from '@/components/discover/FriendAvatar';
import { api, type ConversationItem, type Friend } from '@/lib/api';
import { friendDisplayName } from '@/lib/friend_label';
import { friendRemarkOrName } from '@/lib/friend_remarks';

export type ImContactTarget =
  | { key: string; type: 'dm'; peerId: string; label: string; avatarId?: string | null }
  | { key: string; type: 'group'; gid: string; label: string; avatarId?: string | null };

type Props = {
  open: boolean;
  title: string;
  preview?: string | null;
  headerExtra?: ReactNode;
  confirmLabel?: string;
  leaveMessagePlaceholder?: string;
  defaultLeaveMessage?: string;
  maxSelect?: number;
  onClose: () => void;
  onConfirm: (targets: ImContactTarget[], leaveMessage: string) => Promise<void>;
};

export function ImContactPicker({
  open,
  title,
  preview,
  headerExtra,
  confirmLabel = '发送',
  leaveMessagePlaceholder = '给朋友留言（选填）',
  defaultLeaveMessage = '',
  maxSelect = 9,
  onClose,
  onConfirm,
}: Props) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [groups, setGroups] = useState<ConversationItem[]>([]);
  const [recent, setRecent] = useState<ImContactTarget[]>([]);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Map<string, ImContactTarget>>(new Map());
  const [leaveMsg, setLeaveMsg] = useState(defaultLeaveMessage);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [f, c] = await Promise.all([api.friends(), api.conversations()]);
      const fl = f.friends || [];
      const items = c.items || [];
      const gl = items.filter((x) => x.scope === 'group');
      setFriends(fl);
      setGroups(gl);

      const friendById = new Map(fl.map((x) => [x.user_id, x]));
      const recentTargets: ImContactTarget[] = [];
      for (const it of items) {
        if (it.scope === 'dm' && it.peer_user_id) {
          const fr = friendById.get(it.peer_user_id);
          const label = friendRemarkOrName(
            it.peer_user_id,
            fr ? friendDisplayName(fr) : it.title || '私信',
          );
          recentTargets.push({
            key: `dm:${it.peer_user_id}`,
            type: 'dm',
            peerId: it.peer_user_id,
            label,
            avatarId: fr?.avatar_id || it.peer_avatar_id,
          });
        } else if (it.scope === 'group') {
          recentTargets.push({
            key: `group:${it.ref_id}`,
            type: 'group',
            gid: it.ref_id,
            label: it.title || '共读群',
          });
        }
        if (recentTargets.length >= 8) break;
      }
      setRecent(recentTargets);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setSelected(new Map());
    setLeaveMsg(defaultLeaveMessage);
    setBusy(false);
    setProgress('');
    setErr(null);
    void reload();
  }, [open, reload, defaultLeaveMessage]);

  const query = q.trim().toLowerCase();

  const filteredFriends = useMemo(() => {
    return friends.filter((f) => {
      const label = friendRemarkOrName(f.user_id, friendDisplayName(f)).toLowerCase();
      return !query || label.includes(query);
    });
  }, [friends, query]);

  const filteredGroups = useMemo(() => {
    return groups.filter((g) => {
      const label = (g.title || '').toLowerCase();
      return !query || label.includes(query);
    });
  }, [groups, query]);

  const filteredRecent = useMemo(() => {
    if (!query) return recent;
    return recent.filter((t) => t.label.toLowerCase().includes(query));
  }, [recent, query]);

  const toggle = (t: ImContactTarget) => {
    if (busy) return;
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(t.key)) next.delete(t.key);
      else if (next.size < maxSelect) next.set(t.key, t);
      return next;
    });
  };

  const selectedList = useMemo(() => [...selected.values()], [selected]);

  const submit = async () => {
    if (!selectedList.length || busy) return;
    setBusy(true);
    setErr(null);
    setProgress(`发送中 0/${selectedList.length}`);
    try {
      await onConfirm(selectedList, leaveMsg.trim());
      setProgress(`已发送 ${selectedList.length}/${selectedList.length}`);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  if (!open) return null;

  const renderRow = (t: ImContactTarget) => {
    const on = selected.has(t.key);
    return (
      <button
        key={t.key}
        type="button"
        className={`im-contact-row${on ? ' is-on' : ''}`}
        disabled={busy}
        onClick={() => toggle(t)}
      >
        <span className={`im-contact-check${on ? ' is-on' : ''}`} aria-hidden />
        {t.type === 'dm' ? (
          <FriendAvatar friend={{ user_id: t.peerId, avatar_id: t.avatarId }} size={40} />
        ) : (
          <span className="friend-avatar" style={{ width: 40, height: 40, flexShrink: 0 }} aria-hidden>
            <Avatar id={defaultAvatarId(t.gid)} size={40} />
          </span>
        )}
        <span className="im-contact-main">
          <strong>{t.label}</strong>
          <span className="muted">{t.type === 'dm' ? '私信' : '共读群'}</span>
        </span>
      </button>
    );
  };

  return (
    <div className="sheet-backdrop im-contact-picker-backdrop" onClick={busy ? undefined : onClose}>
      <div
        className="sheet card im-contact-picker"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="im-contact-picker-head">
          <button type="button" className="text-link" disabled={busy} onClick={onClose}>
            取消
          </button>
          <strong>{title}</strong>
          <SheetCloseButton onClick={onClose} />
        </div>

        {preview ? <p className="im-contact-preview muted">{preview}</p> : null}
        {headerExtra}

        <input
          className="search-input im-contact-search"
          value={q}
          placeholder="搜索好友或群"
          disabled={busy}
          onChange={(e) => setQ(e.target.value)}
        />

        {err ? <p className="group-composer-err">{err}</p> : null}
        {busy && progress ? <p className="muted im-contact-progress">{progress}</p> : null}
        {loading ? <p className="muted" style={{ fontSize: 13 }}>加载中…</p> : null}

        <div className="im-contact-scroll">
          {filteredRecent.length > 0 && !query ? (
            <section className="im-contact-section">
              <h3 className="im-contact-section-title">最近</h3>
              <div className="im-contact-recent-row">
                {filteredRecent.map((t) => {
                  const on = selected.has(t.key);
                  return (
                    <button
                      key={`chip-${t.key}`}
                      type="button"
                      className={`im-contact-recent-chip${on ? ' is-on' : ''}`}
                      disabled={busy}
                      onClick={() => toggle(t)}
                    >
                      {on ? <span className="im-contact-recent-check" aria-hidden>✓</span> : null}
                      {t.type === 'dm' ? (
                        <FriendAvatar friend={{ user_id: t.peerId, avatar_id: t.avatarId }} size={48} />
                      ) : (
                        <span className="friend-avatar im-contact-recent-avatar" style={{ width: 48, height: 48 }} aria-hidden>
                          <Avatar id={defaultAvatarId(t.gid)} size={48} />
                        </span>
                      )}
                      <span className="im-contact-recent-name">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}
          {filteredRecent.length > 0 && query ? (
            <section className="im-contact-section">
              <h3 className="im-contact-section-title">最近</h3>
              <div className="im-contact-list">{filteredRecent.map(renderRow)}</div>
            </section>
          ) : null}

          <section className="im-contact-section">
            <h3 className="im-contact-section-title">好友</h3>
            {filteredFriends.length === 0 ? (
              <p className="muted im-contact-empty">{query ? '无匹配好友' : '暂无好友'}</p>
            ) : (
              <div className="im-contact-list">
                {filteredFriends.map((f) => {
                  const label = friendRemarkOrName(f.user_id, friendDisplayName(f));
                  return renderRow({
                    key: `dm:${f.user_id}`,
                    type: 'dm',
                    peerId: f.user_id,
                    label,
                    avatarId: f.avatar_id,
                  });
                })}
              </div>
            )}
          </section>

          <section className="im-contact-section">
            <h3 className="im-contact-section-title">共读群</h3>
            {filteredGroups.length === 0 ? (
              <p className="muted im-contact-empty">{query ? '无匹配群' : '暂无共读群'}</p>
            ) : (
              <div className="im-contact-list">
                {filteredGroups.map((g) =>
                  renderRow({
                    key: `group:${g.ref_id}`,
                    type: 'group',
                    gid: g.ref_id,
                    label: g.title || '共读群',
                  }),
                )}
              </div>
            )}
          </section>
        </div>

        <div className="im-contact-dock">
          <input
            className="im-contact-leave input"
            value={leaveMsg}
            disabled={busy}
            placeholder={leaveMessagePlaceholder}
            maxLength={200}
            onChange={(e) => setLeaveMsg(e.target.value)}
          />
          <button
            type="button"
            className="btn im-contact-send"
            disabled={busy || selectedList.length === 0}
            onClick={() => void submit()}
          >
            {busy
              ? '…'
              : selectedList.length
                ? `${confirmLabel}(${selectedList.length})`
                : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function forwardPreviewLabel(
  items: Array<{ body?: string | null; kind?: string; ref?: string | null }>,
): string {
  const n = items.length;
  if (n <= 0) return '转发';
  const first = items[0]!;
  const k = (first.kind || 'chat').toLowerCase();
  let tip = '';
  if (k === 'image') tip = '[图片]';
  else if (k === 'video') tip = '[视频]';
  else if (k === 'audio') tip = '[语音]';
  else if (k === 'file') tip = '[文件]';
  else if (k === 'verse' || first.ref) tip = '[经文]';
  else if (k === 'checkin') tip = '[打卡]';
  else if (k === 'task') tip = '[任务]';
  else tip = (first.body || '').trim().slice(0, 24) || '[消息]';
  return n === 1 ? `转发：${tip}` : `转发 ${n} 条 · ${tip}`;
}
