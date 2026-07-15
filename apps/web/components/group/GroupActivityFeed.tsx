'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { contentAssetUrl, type GroupMessage } from '@/lib/api';
import { readerHrefFromRef } from '@/lib/group_footprint';
import { formatGroupRefLabel } from '@/lib/ref_label';
import {
  GROUP_CANNED_PHRASES,
  GROUP_EMOJIS,
  cannedPhraseLabel,
} from '@/lib/group_reactions';
import { formatDueCountdown, localDayKey } from '@/lib/group_ui';
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
import { MemberAvatar } from './MemberAvatar';

const QUICK_EMOJIS = GROUP_EMOJIS.slice(0, 3);
const TIME_GAP_MS = 5 * 60 * 1000;

function isTaskCompleteCheckin(m: GroupMessage): boolean {
  return m.kind === 'checkin' && Boolean(m.body?.startsWith('已完成任务·'));
}

function taskCompleteTitle(body: string | null | undefined): string | null {
  if (!body?.startsWith('已完成任务·')) return null;
  const rest = body.slice('已完成任务·'.length);
  const idx = rest.indexOf(' · ');
  return idx >= 0 ? rest.slice(0, idx) : rest;
}

function reactionCount(reactions: Record<string, string[]> | null | undefined): number {
  if (!reactions) return 0;
  return Object.values(reactions).reduce((n, users) => n + users.length, 0);
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
  replyPreview?: { id?: string; author: string; snippet: string } | null;
  onReact: (mid: string, emoji: string) => void;
  onReport: (mid: string) => void;
  onDelete: (mid: string) => void;
  onReply?: (m: GroupMessage) => void;
  onRecall?: (mid: string) => void;
  onCompleteTask?: (taskId: string, title: string, ref?: string | null) => void;
  onResend?: (m: GroupMessage) => void;
};

function ChatBubble({
  gid,
  m,
  isOwner,
  showAvatar,
  showName,
  replyPreview,
  onReact,
  onReport,
  onDelete,
  onReply,
  onRecall,
  onCompleteTask,
  onResend,
}: BubbleProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showRespond, setShowRespond] = useState(false);
  const [showCanned, setShowCanned] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const showRecall = canRecallOwnMessage(m.created_at, {
    mine: m.mine,
    recalled: m.recalled,
    isStaff: isOwner,
  });
  const isTask = m.kind === 'task';
  const isTaskDone = isTaskCompleteCheckin(m);
  const isChatLite =
    m.kind === 'chat' || m.kind === 'image' || m.kind === 'file' || m.kind === 'verse';
  const dueLabel = isTask ? formatDueCountdown(m.task_due_at) : null;
  const completeTitle = isTaskDone ? taskCompleteTitle(m.body) : null;
  const refLabel = m.ref ? formatGroupRefLabel(m.ref) : '';
  const refHref = m.ref
    ? readerHrefFromRef(m.ref, { group: gid, task: m.task_id || undefined })
    : null;
  const member = {
    user_id: m.user_id,
    name: m.author || '群友',
    role: 'member',
    is_me: m.mine,
  };
  const chip = kindChip(m);
  const reactTotal = reactionCount(m.reactions);
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
  };

  const openActions = () => {
    if (m.recalled || m.pending) return;
    longPressFired.current = true;
    setMenuOpen(true);
  };

  const startLongPress = () => {
    longPressFired.current = false;
    clearLongPress();
    longPressTimer.current = setTimeout(openActions, 420);
  };

  const endLongPress = () => {
    clearLongPress();
  };

  return (
    <div
      data-mid={m.id}
      className={`group-chat-row${m.mine ? ' is-mine' : ' is-peer'}${m.pending ? ' is-pending' : ''}${m.sendFailed ? ' is-failed' : ''}`}
    >
      {!m.mine ? (
        <div className="group-chat-avatar-slot">
          {showAvatar ? (
            <MemberAvatar member={member} size={36} className="group-chat-avatar" />
          ) : null}
        </div>
      ) : null}

      <div className="group-chat-col">
        {!m.mine && showName ? (
          <span className="group-chat-name">{m.author || '群友'}</span>
        ) : null}

        <div
          role="button"
          tabIndex={0}
          className={`group-chat-bubble ${bubbleTone(m)}${m.recalled ? ' is-recalled' : ''}`}
          onPointerDown={startLongPress}
          onPointerUp={endLongPress}
          onPointerLeave={endLongPress}
          onPointerCancel={endLongPress}
          onContextMenu={(e) => {
            e.preventDefault();
            openActions();
          }}
          onClick={() => {
            if (longPressFired.current) {
              longPressFired.current = false;
              return;
            }
            setMenuOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openActions();
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
                    const isImg = (a.mime || '').startsWith('image/') || m.kind === 'image';
                    if (isImg && href) {
                      return (
                        <a key={a.id} href={href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={href} alt={a.file_name || '图片'} />
                        </a>
                      );
                    }
                    return href ? (
                      <a key={a.id} href={href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                        {a.file_name || '附件'}
                      </a>
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
            </>
          )}
        </div>

        {reactTotal > 0 && !showRespond ? (
          <div className="group-emoji-bar group-emoji-bar-summary">
            {Object.entries(m.reactions || {})
              .filter(([, users]) => users.length > 0)
              .slice(0, 4)
              .map(([e, users]) => (
                <button
                  key={e}
                  type="button"
                  className="group-emoji-btn active"
                  onClick={() => onReact(m.id, e)}
                >
                  {e.startsWith('phrase:') ? cannedPhraseLabel(e) : e} {users.length}
                </button>
              ))}
          </div>
        ) : null}

        {menuOpen && !m.recalled ? (
          <div className="im-msg-action-sheet" role="dialog" aria-label="消息操作">
            <button
              type="button"
              className="im-msg-action-backdrop"
              aria-label="关闭"
              onClick={() => setMenuOpen(false)}
            />
            <div className="im-msg-action-panel">
              <p className="im-msg-action-title muted">
                {m.mine ? '我' : m.author || '群友'}
              </p>
              <div className="im-msg-action-grid">
                {!m.pending && !m.sendFailed ? (
                  <button type="button" onClick={() => { setShowRespond(true); setMenuOpen(false); }}>
                    回应
                  </button>
                ) : null}
                {onReply && !m.pending && !m.sendFailed && isChatLite ? (
                  <button type="button" onClick={() => { onReply(m); setMenuOpen(false); }}>回复</button>
                ) : null}
                {!m.pending && !m.sendFailed && (m.body || m.ref) ? (
                  <button
                    type="button"
                    onClick={() => {
                      void copyMessageText([m.ref ? formatGroupRefLabel(m.ref) : null, m.body]);
                      setMenuOpen(false);
                    }}
                  >
                    复制
                  </button>
                ) : null}
                {!m.pending && !m.sendFailed && (m.kind === 'checkin' || m.kind === 'verse') && (m.body || m.ref) ? (
                  <button type="button" onClick={() => { void shareMessageCard(); setMenuOpen(false); }}>
                    分享
                  </button>
                ) : null}
                {showRecall && onRecall && !m.pending ? (
                  <button type="button" className="is-danger" onClick={() => { onRecall(m.id); setMenuOpen(false); }}>
                    撤回
                  </button>
                ) : null}
                {(m.mine || isOwner || m.sendFailed) && !m.pending ? (
                  <button type="button" className="is-danger" onClick={() => { onDelete(m.id); setMenuOpen(false); }}>
                    删除
                  </button>
                ) : null}
                {!m.mine && !m.pending ? (
                  <button type="button" onClick={() => { onReport(m.id); setMenuOpen(false); }}>举报</button>
                ) : null}
                {m.sendFailed && onResend && m.kind === 'chat' && m.body ? (
                  <button type="button" onClick={() => { onResend(m); setMenuOpen(false); }}>重发</button>
                ) : null}
              </div>
              <button type="button" className="im-msg-action-cancel" onClick={() => setMenuOpen(false)}>
                取消
              </button>
            </div>
          </div>
        ) : null}

        {showRespond ? (
          <div className="group-activity-respond">
            <div className="group-emoji-bar">
              {QUICK_EMOJIS.map((e) => {
                const count = m.reactions[e]?.length || 0;
                return (
                  <button
                    key={e}
                    type="button"
                    className={`group-emoji-btn${count > 0 ? ' active' : ''}`}
                    onClick={() => onReact(m.id, e)}
                  >
                    {e}
                    {count > 0 ? ` ${count}` : ''}
                  </button>
                );
              })}
              <button
                type="button"
                className="group-emoji-btn muted-more"
                onClick={() => setShowCanned((v) => !v)}
              >
                {showCanned ? '收起' : '更多'}
              </button>
            </div>
            {showCanned ? (
              <div className="group-canned-row">
                {GROUP_CANNED_PHRASES.map((p) => {
                  const count = m.reactions[p.key]?.length || 0;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      className={`group-canned-btn${count > 0 ? ' active' : ''}`}
                      onClick={() => onReact(m.id, p.key)}
                    >
                      {cannedPhraseLabel(p.key)}
                      {count > 0 ? ` ${count}` : ''}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
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
};

export function GroupActivityFeed({
  gid,
  messages,
  isOwner,
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
}: Props) {
  const loadMoreRef = useRef<HTMLDivElement>(null);

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
        const prevTs = prev ? new Date(prev.created_at).getTime() : 0;
        const curTs = new Date(m.created_at).getTime();
        const showTimeSep = !prev || curTs - prevTs > TIME_GAP_MS;
        const sameAuthor =
          Boolean(prev)
          && prev!.kind !== 'system'
          && m.kind !== 'system'
          && prev!.user_id === m.user_id
          && prev!.mine === m.mine
          && !showTimeSep;
        const showAvatar = !m.mine && !sameAuthor;
        // 对方始终显示昵称（规格）；自己不显示「我」
        const showName = !m.mine;

        const dayKey = localDayKey(m.created_at);
        const prevDay = prev ? localDayKey(prev.created_at) : null;
        const showDay = !prev || dayKey !== prevDay;

        const parent = m.reply_to_id ? byId.get(m.reply_to_id) : undefined;
        const replyPreview = parent
          ? {
              id: parent.id,
              author: parent.mine ? '我' : parent.author || '群友',
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
            ) : showTimeSep ? (
              <div className="dm-day-sep is-time" role="separator">
                <span>{formatMsgTime(m.created_at)}</span>
              </div>
            ) : null}
            <ChatBubble
              gid={gid}
              m={m}
              isOwner={isOwner}
              showAvatar={showAvatar}
              showName={showName}
              replyPreview={replyPreview}
              onReact={onReact}
              onReport={onReport}
              onDelete={onDelete}
              onReply={onReply}
              onRecall={onRecall}
              onCompleteTask={onCompleteTask}
              onResend={onResend}
            />
          </div>
        );
      })}
    </div>
  );
}
