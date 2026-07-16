'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { contentAssetUrl, effectiveId, type GroupMember, type GroupMessage } from '@/lib/api';
import { readerHrefFromRef } from '@/lib/group_footprint';
import { formatGroupRefLabel } from '@/lib/ref_label';
import {
  GROUP_EMOJIS,
  GROUP_CANNED_PHRASES,
  cannedPhraseLabel,
  reactionBarEntries,
} from '@/lib/group_reactions';
import { friendRemarkOrName } from '@/lib/friend_remarks';
import {
  displayMemberName,
  formatDueCountdown,
  isPlaceholderDisplayName,
  localDayKey,
} from '@/lib/group_ui';
import {
  canRecallOwnMessage,
  copyMessageText,
  focusMessageById,
  formatMsgDayLabel,
  formatMsgTime,
  replySnippet,
} from '@/lib/im_ui';
import { setReaderReturnHref } from '@/lib/reader_return';
import { shareCard } from '@/lib/share_card';
import { BRAND_NAME } from '@/lib/brand';
import { ImMessageBody } from '@/components/social/ImMessageBody';
import { ImImageLightbox, type ImLightboxImage } from '@/components/social/ImImageLightbox';
import { ImFilePreviewSheet } from '@/components/social/ImFilePreviewSheet';
import { ImMsgActionPopover, type ImPopoverAction } from '@/components/social/ImMsgActionPopover';
import { collectMessageImages, downloadImAsset } from '@/lib/im_media';
import { MemberAvatar } from './MemberAvatar';

const QUICK_EMOJIS = [...GROUP_EMOJIS];
const QUICK_PHRASES = GROUP_CANNED_PHRASES.map((p) => ({ key: p.key, label: p.label }));

function isTaskCompleteCheckin(m: GroupMessage): boolean {
  return m.kind === 'checkin' && Boolean(m.body?.startsWith('已完成任务·'));
}

function taskCompleteTitle(body: string | null | undefined): string | null {
  if (!body?.startsWith('已完成任务·')) return null;
  const rest = body.slice('已完成任务·'.length);
  const idx = rest.indexOf(' · ');
  return idx >= 0 ? rest.slice(0, idx) : rest;
}

function dedupeMilestones(items: GroupMessage[]): GroupMessage[] {
  let milestoneSeen = false;
  return items.filter((m) => {
    if (m.kind !== 'system' || !m.body?.includes('全员打卡')) return true;
    if (milestoneSeen) return false;
    milestoneSeen = true;
    return true;
  });
}

function bubbleTone(m: GroupMessage): string {
  if (m.kind === 'task') return 'is-task';
  if (isTaskCompleteCheckin(m)) return 'is-task-done';
  if (m.kind === 'checkin') return 'is-checkin';
  if (m.kind === 'plan') return 'is-plan';
  if (m.kind === 'verse') return 'is-verse';
  return 'is-chat';
}

function kindChip(m: GroupMessage): string | null {
  if (m.recalled) return null;
  if (m.kind === 'task') return '任务';
  if (isTaskCompleteCheckin(m)) return '完成';
  if (m.kind === 'checkin') return '打卡';
  if (m.kind === 'plan') return '计划';
  if (m.kind === 'verse') return '经文';
  return null;
}

type BubbleProps = {
  gid: string;
  m: GroupMessage;
  isOwner: boolean;
  showAvatar: boolean;
  showName: boolean;
  membersById: Map<string, GroupMember>;
  replyPreview?: { id?: string; author: string; snippet: string } | null;
  onReact: (mid: string, emoji: string) => void;
  onReport: (mid: string) => void;
  onDelete: (mid: string) => void;
  onReply?: (m: GroupMessage) => void;
  onRecall?: (mid: string) => void;
  onCompleteTask?: (taskId: string, title: string, ref?: string | null) => void;
  onResend?: (m: GroupMessage) => void;
  onForward?: (m: GroupMessage) => void;
  onOpenImages: (images: ImLightboxImage[], index: number) => void;
  onMemberClick?: (member: GroupMember) => void;
  onOpenFile: (payload: {
    url: string;
    fileName?: string | null;
    mime?: string | null;
    storageKey?: string | null;
  }) => void;
};

function ChatBubble({
  gid,
  m,
  isOwner: _isOwner,
  showAvatar,
  showName,
  membersById,
  replyPreview,
  onReact,
  onReport,
  onDelete,
  onReply,
  onRecall,
  onCompleteTask,
  onResend,
  onForward,
  onOpenImages,
  onMemberClick,
  onOpenFile,
}: BubbleProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [imgBroken, setImgBroken] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStart = useRef<{ x: number; y: number } | null>(null);
  const longPressFired = useRef(false);
  const uid = effectiveId();

  useEffect(() => {
    setImgBroken(false);
  }, [m.id, m.attachments?.map((a) => a.url).join('|')]);
  const actionMine = Boolean(m.mine || (m.user_id && uid && m.user_id === uid));
  const showRecall = canRecallOwnMessage(m.created_at, {
    mine: actionMine,
    recalled: m.recalled,
  });
  const isTask = m.kind === 'task';
  const isTaskDone = isTaskCompleteCheckin(m);
  const isCheckin = m.kind === 'checkin' && !m.recalled && !m.pending;
  const isChatLite =
    m.kind === 'chat' || m.kind === 'image' || m.kind === 'file' || m.kind === 'verse';
  const dueLabel = isTask ? formatDueCountdown(m.task_due_at) : null;
  const completeTitle = isTaskDone ? taskCompleteTitle(m.body) : null;
  const refLabel = m.ref ? formatGroupRefLabel(m.ref) : '';
  const refHref = m.ref
    ? readerHrefFromRef(m.ref, { group: gid, task: m.task_id || undefined })
    : null;
  const memberFromDetail = m.user_id ? membersById.get(m.user_id) : undefined;
  const member: GroupMember = memberFromDetail || {
    user_id: m.user_id,
    name: m.author || '',
    role: 'member',
    is_me: actionMine,
  };
  const displayName = actionMine
    ? '我'
    : displayMemberName({
        ...member,
        name: isPlaceholderDisplayName(member.name) ? (m.author || '') : member.name,
        is_me: false,
      });
  const chip = kindChip(m);
  const msgImages = collectMessageImages(m.attachments, m.kind);
  const beforeReader = () => {
    if (typeof window !== 'undefined') {
      setReaderReturnHref(`${window.location.pathname}${window.location.search}`);
    }
  };
  const bodyForRender = (() => {
    if (!m.body) return null;
    if (!isTaskDone) return m.body;
    const extra = m.body.replace(/^已完成任务·[^·]+(?: · )?/, '').trim();
    return extra || null;
  })();

  const shareMessageCard = async () => {
    const title = refLabel
      ? (m.kind === 'verse' ? `经文 · ${refLabel}` : `今日打卡 · ${refLabel}`)
      : m.kind === 'verse'
        ? '经文'
        : '今日打卡';
    await shareCard({ title, body: m.body || refLabel || '', footer: BRAND_NAME });
  };

  if (m.kind === 'system') {
    return (
      <div data-mid={m.id} className="group-chat-system">
        <span>{m.body || '系统消息'}</span>
      </div>
    );
  }

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressStart.current = null;
  };

  const openActions = (el?: HTMLElement | null) => {
    if (m.recalled || m.pending) return;
    longPressFired.current = true;
    try {
      navigator.vibrate?.(12);
    } catch {
      /* ignore */
    }
    setAnchorEl(el ?? null);
    setMenuOpen(true);
  };

  const closeActions = () => {
    setMenuOpen(false);
    setAnchorEl(null);
  };

  const startLongPress = (el: HTMLElement, x: number, y: number) => {
    longPressFired.current = false;
    clearLongPress();
    longPressStart.current = { x, y };
    longPressTimer.current = setTimeout(() => openActions(el), 450);
  };

  const actionItems: ImPopoverAction[] = (() => {
    const items: ImPopoverAction[] = [];
    if (m.sendFailed) {
      if (onResend && m.kind === 'chat' && m.body) {
        items.push({ id: 'resend', label: '重发', onClick: () => onResend(m) });
      }
      items.push({ id: 'delete', label: '删除', danger: true, onClick: () => onDelete(m.id) });
      return items;
    }
    if (!m.pending) {
      if (onReply && isChatLite) {
        items.push({ id: 'reply', label: '回复', onClick: () => onReply(m) });
      }
      if (m.body || m.ref) {
        items.push({
          id: 'copy',
          label: '复制',
          onClick: () => {
            void copyMessageText([m.ref ? formatGroupRefLabel(m.ref) : null, m.body]);
          },
        });
      }
      if (msgImages.length) {
        items.push({
          id: 'save',
          label: '保存',
          onClick: () => {
            void downloadImAsset(msgImages[0]!.src, msgImages[0]!.alt);
          },
        });
      }
      if ((m.kind === 'checkin' || m.kind === 'verse') && (m.body || m.ref)) {
        items.push({
          id: 'share',
          label: '分享',
          onClick: () => {
            void shareMessageCard();
          },
        });
      }
      if (onForward && (m.body || m.ref) && !m.recalled) {
        items.push({
          id: 'forward',
          label: '转发',
          onClick: () => onForward(m),
        });
      }
      if (showRecall && onRecall) {
        items.push({
          id: 'recall',
          label: '撤回',
          danger: true,
          onClick: () => onRecall(m.id),
        });
      }
      if (actionMine) {
        items.push({
          id: 'delete',
          label: '删除',
          danger: true,
          onClick: () => onDelete(m.id),
        });
      }
      if (!actionMine) {
        items.push({
          id: 'report',
          label: '举报',
          danger: true,
          onClick: () => onReport(m.id),
        });
      }
    }
    return items;
  })();

  return (
    <div
      data-mid={m.id}
      className={`group-chat-row${actionMine ? ' is-mine' : ' is-peer'}${m.pending ? ' is-pending' : ''}${m.sendFailed ? ' is-failed' : ''}`}
    >
      <div className="group-chat-avatar-slot">
        {showAvatar ? (
          <button
            type="button"
            className="group-chat-avatar-btn"
            disabled={!member.user_id || actionMine}
            aria-label={actionMine ? undefined : `查看 ${displayName}`}
            onClick={(e) => {
              e.stopPropagation();
              if (member.user_id && !actionMine) onMemberClick?.(member);
            }}
          >
            <MemberAvatar member={member} size={36} className="group-chat-avatar" />
          </button>
        ) : null}
      </div>

      <div className="group-chat-col">
        {showName ? (
          <div className="group-chat-meta-line">
            <span className="group-chat-name">{displayName}</span>
            {m.created_at ? (
              <time className="group-chat-time" dateTime={m.created_at}>
                {formatMsgTime(m.created_at)}
              </time>
            ) : null}
          </div>
        ) : null}

        <div
          role="button"
          tabIndex={0}
          className={`group-chat-bubble ${bubbleTone(m)}${m.recalled ? ' is-recalled' : ''}`}
          onPointerDown={(e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            startLongPress(e.currentTarget, e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            const s = longPressStart.current;
            if (!s || !longPressTimer.current) return;
            if (Math.abs(e.clientX - s.x) > 12 || Math.abs(e.clientY - s.y) > 12) {
              clearLongPress();
            }
          }}
          onPointerUp={clearLongPress}
          onPointerCancel={clearLongPress}
          onContextMenu={(e) => {
            e.preventDefault();
            openActions(e.currentTarget);
          }}
          onClick={() => {
            if (longPressFired.current) {
              longPressFired.current = false;
              return;
            }
            closeActions();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openActions(e.currentTarget);
            }
          }}
        >
          {m.recalled ? (
            <span className="muted">消息已撤回</span>
          ) : (
            <>
              {(chip || dueLabel) && (
                <div className="group-chat-bubble-meta">
                  {chip ? <span className="group-chat-kind-chip">{chip}</span> : null}
                  {dueLabel ? <span className="group-task-due-badge">{dueLabel}</span> : null}
                </div>
              )}

              {replyPreview ? (
                <span
                  className="group-msg-reply-quote is-tappable"
                  role={replyPreview.id ? 'button' : undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (replyPreview.id) focusMessageById(replyPreview.id);
                  }}
                >
                  <span className="muted">{replyPreview.author}</span>
                  <p>{replyPreview.snippet}</p>
                </span>
              ) : null}

              {isTaskDone && completeTitle ? (
                <p className="group-activity-task-done">
                  已完成 · <strong>{completeTitle}</strong>
                </p>
              ) : null}

              <ImMessageBody body={bodyForRender} ref={m.ref} kind={m.kind} mentions={m.mentions} />

              {m.attachments && m.attachments.length > 0 ? (
                <div className="group-msg-attach">
                  {m.attachments.map((a) => {
                    const href = a.url ? contentAssetUrl(a.url) : null;
                    const name = (a.file_name || a.url || '').toLowerCase();
                    const byExt = /\.(png|jpe?g|gif|webp|heic|bmp)(\?|$)/i.test(name);
                    const isImg =
                      (a.mime || '').startsWith('image/') || m.kind === 'image' || byExt;
                    if (isImg && href) {
                      const idx = msgImages.findIndex((img) => img.src === href);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          className="im-attach-image-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (longPressFired.current) {
                              longPressFired.current = false;
                              return;
                            }
                            if (!imgBroken) onOpenImages(msgImages, idx >= 0 ? idx : 0);
                          }}
                        >
                          {imgBroken ? (
                            <span className="im-attach-broken muted">图片无法加载</span>
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={href}
                              alt={a.file_name || '图片'}
                              onError={() => setImgBroken(true)}
                            />
                          )}
                        </button>
                      );
                    }
                    return href ? (
                      <button
                        key={a.id}
                        type="button"
                        className="im-attach-file-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenFile({
                            url: href,
                            fileName: a.file_name,
                            mime: a.mime,
                            storageKey: a.storage_key,
                          });
                        }}
                      >
                        {a.file_name || '附件'}
                      </button>
                    ) : (
                      <span key={a.id}>{a.file_name || '附件'}</span>
                    );
                  })}
                </div>
              ) : null}

              {isTask && m.task_id && onCompleteTask && !m.mine ? (
                <div className="group-task-actions" onClick={(e) => e.stopPropagation()}>
                  {m.my_task_done ? (
                    <span className="group-task-done">已完成 ✓</span>
                  ) : (
                    <>
                      {refHref && (
                        <Link
                          href={`${refHref}&taskTitle=${encodeURIComponent(m.body || '任务')}`}
                          className="font-pill"
                          onClick={beforeReader}
                        >
                          去读
                        </Link>
                      )}
                      <button
                        type="button"
                        className="font-pill accent"
                        onClick={() => onCompleteTask(m.task_id!, m.body || '任务', m.ref)}
                      >
                        完成
                      </button>
                    </>
                  )}
                </div>
              ) : null}

              {isCheckin ? (
                <div className="group-checkin-card-foot" onClick={(e) => e.stopPropagation()}>
                  <div className="group-checkin-canned">
                    {(['🙏', '❤️', '👍'] as const).map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="group-checkin-canned-btn"
                        aria-label={`回应 ${emoji}`}
                        onClick={() => onReact(m.id, emoji)}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                  {refHref ? (
                    <Link
                      href={refHref}
                      className="text-link group-checkin-read-link"
                      onClick={beforeReader}
                    >
                      去读
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>

        {!m.recalled && !m.pending && !m.sendFailed ? (() => {
          const entries = reactionBarEntries(m.reactions);
          if (!entries.length) return null;
          return (
          <div className="group-emoji-bar group-emoji-bar-summary">
            {entries.map(({ key, count }) => (
              <button
                key={key}
                type="button"
                className="group-emoji-btn active"
                aria-label={key.startsWith('phrase:') ? cannedPhraseLabel(key) : `回应 ${key}`}
                onClick={() => onReact(m.id, key)}
              >
                {key.startsWith('phrase:') ? cannedPhraseLabel(key) : key}
                {` ${count}`}
              </button>
            ))}
          </div>
          );
        })() : null}

        {menuOpen && !m.recalled && actionItems.length > 0 ? (
          <ImMsgActionPopover
            open
            anchorEl={anchorEl}
            align={actionMine ? 'end' : 'start'}
            actions={actionItems}
            onClose={closeActions}
            quickEmojis={!m.pending && !m.sendFailed ? QUICK_EMOJIS : undefined}
            phraseKeys={!m.pending && !m.sendFailed ? QUICK_PHRASES : undefined}
            onEmoji={!m.pending && !m.sendFailed ? (e) => onReact(m.id, e) : undefined}
          />
        ) : null}

        {(m.pending || m.sendFailed) ? (
          <span className="group-chat-time muted">
            {m.pending ? '发送中…' : '发送失败'}
          </span>
        ) : null}
      </div>
    </div>
  );
}

type Props = {
  gid: string;
  messages: GroupMessage[];
  isOwner: boolean;
  members?: GroupMember[];
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onOpenComposer?: () => void;
  onReact: (mid: string, emoji: string) => void;
  onReport: (mid: string) => void;
  onDelete: (mid: string) => void;
  onReply?: (m: GroupMessage) => void;
  onRecall?: (mid: string) => void;
  onCompleteTask?: (taskId: string, title: string, ref?: string | null) => void;
  onResend?: (m: GroupMessage) => void;
  onForward?: (m: GroupMessage) => void;
  onMemberClick?: (member: GroupMember) => void;
};

export function GroupActivityFeed({
  gid,
  messages,
  isOwner,
  members = [],
  hasMore,
  loadingMore,
  onLoadMore,
  onOpenComposer,
  onReact,
  onReport,
  onDelete,
  onReply,
  onRecall,
  onCompleteTask,
  onResend,
  onForward,
  onMemberClick,
}: Props) {
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [lightbox, setLightbox] = useState<{ images: ImLightboxImage[]; index: number } | null>(
    null,
  );
  const [filePreview, setFilePreview] = useState<{
    url: string;
    fileName?: string | null;
    mime?: string | null;
    storageKey?: string | null;
  } | null>(null);

  const membersById = useMemo(() => {
    const map = new Map<string, GroupMember>();
    for (const mem of members) {
      if (mem.user_id) map.set(mem.user_id, mem);
    }
    return map;
  }, [members]);

  const openImages = (images: ImLightboxImage[], index: number) => {
    if (!images.length) return;
    setLightbox({ images, index });
  };

  const byId = useMemo(() => {
    const map = new Map<string, GroupMessage>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  const chrono = useMemo(() => {
    const sorted = [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
    return dedupeMilestones(sorted);
  }, [messages]);

  useEffect(() => {
    if (!hasMore || !onLoadMore) return;
    const el = loadMoreRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore) onLoadMore();
      },
      { rootMargin: '120px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadingMore, onLoadMore]);

  if (messages.length === 0) {
    return (
      <div className="group-activity-empty group-chat-empty">
        <strong>还没有消息</strong>
        <p className="muted">打个招呼，或完成今日阅读后来打卡。</p>
        {onOpenComposer ? (
          <button type="button" className="btn" onClick={onOpenComposer}>
            发第一条打卡
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="group-chat-feed">
      <div ref={loadMoreRef} className="group-feed-load-sentinel" aria-hidden>
        {loadingMore ? <span className="muted">加载更早消息…</span> : null}
        {!hasMore && chrono.length > 12 ? <span className="muted">没有更早消息了</span> : null}
      </div>

      {chrono.map((m, idx) => {
        const prev = idx > 0 ? chrono[idx - 1] : null;
        const showAvatar = true;
        const showName = true;

        const dayKey = localDayKey(m.created_at);
        const prevDay = prev ? localDayKey(prev.created_at) : null;
        const showDay = !prev || dayKey !== prevDay;

        const parent = m.reply_to_id ? byId.get(m.reply_to_id) : undefined;
        const replyAuthor = (() => {
          if (!parent) return '原消息';
          if (parent.mine) return '我';
          const mem = parent.user_id ? membersById.get(parent.user_id) : undefined;
          if (mem) return displayMemberName(mem);
          if (parent.author && !isPlaceholderDisplayName(parent.author)) return parent.author;
          return friendRemarkOrName(parent.user_id, '书友');
        })();
        const replyPreview = parent
          ? {
              id: parent.id,
              author: replyAuthor,
              snippet: parent.recalled
                ? '消息已撤回'
                : replySnippet(parent.body, parent.kind, parent.attachments?.[0]?.file_name),
            }
          : m.reply_to_id
            ? { author: '原消息', snippet: '（暂未加载）' }
            : null;

        return (
          <div key={m.id} className="group-chat-block">
            {showDay ? (
              <div className="dm-day-sep" role="separator">
                <span>{formatMsgDayLabel(dayKey)}</span>
              </div>
            ) : null}
            <ChatBubble
              gid={gid}
              m={m}
              isOwner={isOwner}
              showAvatar={showAvatar}
              showName={showName}
              membersById={membersById}
              replyPreview={replyPreview}
              onReact={onReact}
              onReport={onReport}
              onDelete={onDelete}
              onReply={onReply}
              onRecall={onRecall}
              onCompleteTask={onCompleteTask}
              onResend={onResend}
              onForward={onForward}
              onOpenImages={openImages}
              onMemberClick={onMemberClick}
              onOpenFile={(payload) => setFilePreview(payload)}
            />
          </div>
        );
      })}

      {lightbox ? (
        <ImImageLightbox
          images={lightbox.images}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onIndexChange={(i) => setLightbox((prev) => (prev ? { ...prev, index: i } : prev))}
        />
      ) : null}

      {filePreview ? (
        <ImFilePreviewSheet
          url={filePreview.url}
          fileName={filePreview.fileName}
          mime={filePreview.mime}
          storageKey={filePreview.storageKey}
          onClose={() => setFilePreview(null)}
        />
      ) : null}
    </div>
  );
}
