'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';
import Avatar, { defaultAvatarId } from '@/components/Avatar';
import { FriendAvatar } from '@/components/discover/FriendAvatar';
import {
  ImContactPicker,
  type ImContactTarget,
} from '@/components/social/ImContactPicker';
import { api, effectiveId } from '@/lib/api';
import { recordGroupCheckin } from '@/lib/badge_events';
import { friendDisplayName } from '@/lib/friend_label';
import { friendRemarkOrName } from '@/lib/friend_remarks';
import { leaveFlutterH5ToDiscover } from '@/lib/flutter_h5_bridge';
import { requestInviteNudge } from '@/lib/invite_nudge';
import { formatGroupRefLabel } from '@/lib/ref_label';
import {
  buildShelfBookShareRef,
  buildShelfCheckinRef,
  formatShelfCheckinLabel,
  normalizeCheckinBody,
  rememberShelfRefLabel,
  SHELF_BOOK_SHARE_CHIPS,
  SHELF_CHECKIN_CHIPS,
  GROUP_CHECKIN_BODY_MAX,
} from '@/lib/shelf_checkin';
import { buildShelfBookShareCopy, shareShelfBook } from '@/lib/shelf_share';

type Props = {
  bookId: string;
  bookTitle: string;
  subtitle?: string;
  author?: string;
  /** 阅读器内：分享到群时带上当前节 */
  sectionId?: string;
  sectionTitle?: string;
  pageIndex?: number;
  presetGroupId?: string | null;
  onClose: () => void;
  onToast?: (msg: string) => void;
  onDone?: () => void;
};

/** 书籍分享半屏：上半最近群/好友，下半系统分享。 */
export default function ShelfShareSheet({
  bookId,
  bookTitle,
  subtitle = '',
  author = '',
  sectionId,
  sectionTitle = '',
  pageIndex = 0,
  presetGroupId,
  onClose,
  onToast,
  onDone,
}: Props) {
  const bookShare = !sectionId;
  const chips = bookShare ? SHELF_BOOK_SHARE_CHIPS : SHELF_CHECKIN_CHIPS;
  const uid = effectiveId();

  const [recent, setRecent] = useState<ImContactTarget[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(Boolean(uid));
  const [selected, setSelected] = useState<ImContactTarget | null>(null);
  const [body, setBody] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const checkinRef = useCallback(
    () =>
      bookShare
        ? buildShelfBookShareRef(bookId)
        : buildShelfCheckinRef(bookId, sectionId!, pageIndex),
    [bookId, bookShare, pageIndex, sectionId],
  );

  const checkinLabel = useCallback(() => {
    const ref = checkinRef();
    return (
      formatGroupRefLabel(ref)
      || formatShelfCheckinLabel(bookTitle, bookShare ? '推荐书目' : sectionTitle)
    );
  }, [bookShare, bookTitle, checkinRef, sectionTitle]);

  const dmShareBody = useMemo(() => {
    if (!bookShare) {
      return formatShelfCheckinLabel(bookTitle, sectionTitle || '读到这里');
    }
    const pack = buildShelfBookShareCopy({
      bookId,
      title: bookTitle,
      subtitle,
      author,
    });
    return [pack.shareText, pack.url].filter(Boolean).join('\n');
  }, [author, bookId, bookShare, bookTitle, sectionTitle, subtitle]);

  useEffect(() => {
    if (!uid) {
      setLoadingRecent(false);
      return;
    }
    let cancelled = false;
    setLoadingRecent(true);
    void (async () => {
      try {
        const [f, c] = await Promise.all([api.friends(), api.conversations()]);
        if (cancelled) return;
        const fl = f.friends || [];
        const friendById = new Map(fl.map((x) => [x.user_id, x]));
        const items = c.items || [];
        const targets: ImContactTarget[] = [];
        for (const it of items) {
          if (it.scope === 'dm' && it.peer_user_id) {
            const fr = friendById.get(it.peer_user_id);
            targets.push({
              key: `dm:${it.peer_user_id}`,
              type: 'dm',
              peerId: it.peer_user_id,
              label: friendRemarkOrName(
                it.peer_user_id,
                fr ? friendDisplayName(fr) : it.title || '私信',
              ),
              avatarId: fr?.avatar_id || it.peer_avatar_id,
            });
          } else if (it.scope === 'group') {
            targets.push({
              key: `group:${it.ref_id}`,
              type: 'group',
              gid: it.ref_id,
              label: it.title || '共读群',
            });
          }
          if (targets.length >= 8) break;
        }
        setRecent(targets);
        if (presetGroupId) {
          const hit = targets.find(
            (t) => t.type === 'group' && t.gid === presetGroupId,
          );
          if (hit) setSelected(hit);
          else {
            setSelected({
              key: `group:${presetGroupId}`,
              type: 'group',
              gid: presetGroupId,
              label: '共读群',
            });
          }
        }
      } catch {
        if (!cancelled) setRecent([]);
      } finally {
        if (!cancelled) setLoadingRecent(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [presetGroupId, uid]);

  const sendToTargets = useCallback(
    async (targets: ImContactTarget[], leaveMessage: string) => {
      const ref = checkinRef();
      const label = formatShelfCheckinLabel(
        bookTitle,
        bookShare ? '推荐书目' : sectionTitle,
      );
      rememberShelfRefLabel(ref, label);
      const msg = leaveMessage.trim();

      for (const t of targets) {
        if (t.type === 'group') {
          await api.checkin(t.gid, {
            ref,
            body: normalizeCheckinBody(msg),
          });
          recordGroupCheckin(t.gid);
        } else {
          const dm = await api.openDm(t.peerId);
          const text = (msg || dmShareBody).slice(0, 2000);
          await api.sendDm(dm.thread_id, { kind: 'chat', body: text });
        }
      }

      void import('@/lib/activity_log').then((m) =>
        m.logShelfCheckin(bookId, sectionId ?? undefined),
      );
      requestInviteNudge(1600);
    },
    [bookId, bookShare, bookTitle, checkinRef, dmShareBody, sectionId, sectionTitle],
  );

  const shareExternal = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const result = await shareShelfBook({
        bookId,
        title: bookTitle,
        subtitle,
        author,
      });
      if (result === 'cancelled') return;
      if (result === 'failed') {
        setErr('分享失败');
        return;
      }
      onToast?.(result === 'copied' ? '已复制链接与摘要' : '已调起分享');
      onDone?.();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const sendSelected = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await sendToTargets([selected], body);
      onToast?.(`已分享到 ${selected.label}`);
      onDone?.();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (pickerOpen) {
    return (
      <ImContactPicker
        open
        title={bookShare ? '分享书籍' : '分享到群 / 好友'}
        preview={checkinLabel()}
        defaultLeaveMessage={body}
        leaveMessagePlaceholder={bookShare ? '附言（可选）' : '写下阅读感受（可选）'}
        confirmLabel="分享"
        onClose={() => setPickerOpen(false)}
        onConfirm={async (targets, leaveMessage) => {
          await sendToTargets(targets, leaveMessage);
          onToast?.(
            targets.length === 1
              ? `已分享到 ${targets[0]!.label}`
              : `已分享到 ${targets[0]!.label} 等 ${targets.length} 个会话`,
          );
          onDone?.();
          onClose();
        }}
      />
    );
  }

  return (
    <AppBodyPortal>
      <div className="sheet-backdrop" onClick={onClose}>
        <div
          className="sheet card daily-verse-share-sheet shelf-unified-share"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="分享书籍"
        >
          <div className="half-sheet-grab" aria-hidden />
          <div className="section-row group-settings-sheet-head">
            <button type="button" className="text-link" onClick={onClose}>
              关闭
            </button>
            <strong>分享书籍</strong>
            <span style={{ width: 36 }} aria-hidden />
          </div>

          <p className="muted daily-verse-share-preview">《{bookTitle}》</p>
          {(author || subtitle) ? (
            <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {[author, subtitle].filter(Boolean).join(' · ')}
            </p>
          ) : null}

          <section className="shelf-unified-share-social">
            <div className="shelf-unified-share-social-head">
              <h3 className="im-contact-section-title">最近</h3>
              {uid ? (
                <button
                  type="button"
                  className="text-link"
                  disabled={busy}
                  onClick={() => setPickerOpen(true)}
                >
                  更多
                </button>
              ) : null}
            </div>

            {!uid ? (
              <p className="muted" style={{ fontSize: 13 }}>
                登录后可分享到共读群或好友。
                {' '}
                <a className="text-link" href="/profile">前往我的</a>
              </p>
            ) : loadingRecent ? (
              <p className="muted" style={{ fontSize: 13 }}>加载中…</p>
            ) : recent.length === 0 ? (
              <div>
                <p className="muted" style={{ fontSize: 13 }}>
                  暂无最近会话。可从「更多」选择，或先去消息里共读。
                </p>
                <a
                  href="/discover"
                  className="font-pill"
                  style={{ marginTop: 8, display: 'inline-block', fontSize: 12 }}
                  onClick={(e) => {
                    if (leaveFlutterH5ToDiscover('/discover')) e.preventDefault();
                  }}
                >
                  进入消息
                </a>
              </div>
            ) : (
              <div className="im-contact-recent-row shelf-unified-share-recent">
                {recent.map((t) => {
                  const on = selected?.key === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      className={`im-contact-recent-chip${on ? ' is-on' : ''}`}
                      disabled={busy}
                      onClick={() =>
                        setSelected((prev) => (prev?.key === t.key ? null : t))
                      }
                    >
                      {on ? (
                        <span className="im-contact-recent-check" aria-hidden>
                          ✓
                        </span>
                      ) : null}
                      {t.type === 'dm' ? (
                        <FriendAvatar
                          friend={{ user_id: t.peerId, avatar_id: t.avatarId }}
                          size={48}
                        />
                      ) : (
                        <span
                          className="friend-avatar im-contact-recent-avatar"
                          style={{ width: 48, height: 48 }}
                          aria-hidden
                        >
                          <Avatar id={defaultAvatarId(t.gid)} size={48} />
                        </span>
                      )}
                      <span className="im-contact-recent-name">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {selected ? (
              <div className="shelf-unified-share-compose">
                {selected.type === 'group' ? (
                  <div className="chip-swipe group-chip-swipe">
                    {chips.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        className={`group-chip chip-swipe-item${body === chip ? ' selected' : ''}`}
                        disabled={busy}
                        onClick={() =>
                          setBody((prev) => (prev === chip ? '' : chip))
                        }
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="shelf-unified-share-dock">
                  <input
                    className="im-contact-leave input"
                    value={body}
                    disabled={busy}
                    maxLength={GROUP_CHECKIN_BODY_MAX}
                    placeholder={
                      selected.type === 'group'
                        ? '附言（可选）'
                        : '留言（可选，默认分享文案）'
                    }
                    onChange={(e) =>
                      setBody(e.target.value.slice(0, GROUP_CHECKIN_BODY_MAX))
                    }
                  />
                  <button
                    type="button"
                    className="btn im-contact-send"
                    disabled={busy}
                    onClick={() => void sendSelected()}
                  >
                    {busy ? '…' : '发送'}
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <div className="shelf-unified-share-system">
            <button
              type="button"
              className="btn btn-block"
              disabled={busy}
              onClick={() => void shareExternal()}
            >
              {busy && !selected ? '准备中…' : '系统分享'}
            </button>
            <p className="muted shelf-unified-share-system-hint">
              微信、短信等其它应用
            </p>
          </div>

          {err ? (
            <p className="muted" role="alert" style={{ marginTop: 8 }}>
              {err}
            </p>
          ) : null}
        </div>
      </div>
    </AppBodyPortal>
  );
}
