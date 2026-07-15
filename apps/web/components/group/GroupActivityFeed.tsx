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
  formatMsgTime,
  replySnippet,
} from '@/lib/im_ui';
import { setReaderReturnHref } from '@/lib/reader_return';
import { shareCard } from '@/lib/share_card';
import { BRAND_NAME } from '@/lib/brand';
import { ImMessageBody } from '@/components/social/ImMessageBody';
import { MemberAvatar } from './MemberAvatar';

const QUICK_EMOJIS = GROUP_EMOJIS.slice(0, 3);
const TODAY_PREVIEW = 5;

function dayLabel(dayKey: string): string {
  const today = localDayKey(new Date());
  const yesterday = localDayKey(new Date(Date.now() - 86400000));
  if (dayKey === today) return '今天';
  if (dayKey === yesterday) return '昨天';
  return dayKey.replace(/-/g, '/');
}

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

export type FeedFilter = 'all' | 'checkin_task' | 'file';

function matchesFeedFilter(m: GroupMessage, filter: FeedFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'checkin_task') {
    return m.kind === 'checkin' || m.kind === 'task';
  }
  if (filter === 'file') {
    if (m.kind === 'image' || m.kind === 'file') return true;
    return Boolean(m.attachments && m.attachments.length > 0);
  }
  return true;
}

const FEED_FILTERS: { id: FeedFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'checkin_task', label: '打卡与任务' },
  { id: 'file', label: '文件' },
];


type CardProps = {
  gid: string;
  m: GroupMessage;
  isOwner: boolean;
  replyPreview?: { id?: string; author: string; snippet: string } | null;
  onReact: (mid: string, emoji: string) => void;
  onReport: (mid: string) => void;
  onDelete: (mid: string) => void;
  onReply?: (m: GroupMessage) => void;
  onRecall?: (mid: string) => void;
  onCompleteTask?: (taskId: string, title: string, ref?: string | null) => void;
  onResend?: (m: GroupMessage) => void;
};

function ActivityCard({
  gid,
  m,
  isOwner,
  replyPreview,
  onReact,
  onReport,
  onDelete,
  onReply,
  onRecall,
  onCompleteTask,
  onResend,
}: CardProps) {
  const [showRespond, setShowRespond] = useState(false);
  const [showCanned, setShowCanned] = useState(false);
  const showRecall = canRecallOwnMessage(m.created_at, {
    mine: m.mine,
    recalled: m.recalled,
    isStaff: isOwner,
  });
  const isTask = m.kind === 'task';
  const isTaskDone = isTaskCompleteCheckin(m);
  const isChatLite =
    m.kind === 'chat' || m.kind === 'image' || m.kind === 'file' || m.kind === 'verse';
  const kindLabel = m.recalled
    ? '已撤回'
    : isTask
      ? '任务'
      : isTaskDone
        ? '任务完成'
        : m.kind === 'verse'
          ? '经文'
          : m.kind === 'image'
            ? '图片'
            : m.kind === 'file'
              ? '文件'
              : isChatLite
                ? '闲聊'
                : '打卡';
  const dueLabel = isTask ? formatDueCountdown(m.task_due_at) : null;
  const completeTitle = isTaskDone ? taskCompleteTitle(m.body) : null;
  const refLabel = m.ref ? formatGroupRefLabel(m.ref) : '';
  const refHref = m.ref ? readerHrefFromRef(m.ref, { group: gid, task: m.task_id || undefined }) : null;
  const member = { user_id: m.user_id, name: m.author || '群友', role: 'member', is_me: m.mine };
  const beforeReader = () => {
    if (typeof window !== 'undefined') {
      setReaderReturnHref(`${window.location.pathname}${window.location.search}`);
    }
  };
  const tone = isTask
    ? 'group-activity-task'
    : isTaskDone
      ? 'group-activity-task-done'
      : isChatLite
        ? 'group-activity-chat'
        : 'group-activity-checkin';
  const reactTotal = reactionCount(m.reactions);

  const shareMessageCard = async () => {
    const title = refLabel ? `今日打卡 · ${refLabel}` : '今日打卡';
    await shareCard({ title, body: m.body || '', footer: BRAND_NAME });
  };

  const bodyForRender = (() => {
    if (!m.body) return null;
    if (!isTaskDone) return m.body;
    const extra = m.body.replace(/^已完成任务·[^·]+(?: · )?/, '').trim();
    return extra || null;
  })();

  if (m.recalled) {
    return (
      <article data-mid={m.id} className={`group-activity-card ${tone}`}>
        <div className="group-activity-card-head">
          <div className="group-activity-card-meta">
            <MemberAvatar member={member} size={28} className="group-activity-avatar" />
            <span className="group-activity-kind">{kindLabel}</span>
            <span className="group-activity-author">{m.mine ? '我' : (m.author || '群友')}</span>
            <span className="muted group-activity-time">{formatMsgTime(m.created_at)}</span>
          </div>
        </div>
        <p className="muted group-activity-body">消息已撤回</p>
      </article>
    );
  }

  return (
    <article
      data-mid={m.id}
      className={`group-activity-card ${tone}${m.pending ? ' is-pending' : ''}${m.sendFailed ? ' is-failed' : ''}`}
    >
      <div className="group-activity-card-head">
        <div className="group-activity-card-meta">
          <MemberAvatar member={member} size={28} className="group-activity-avatar" />
          <span className="group-activity-kind">{kindLabel}</span>
          <span className="group-activity-author">{m.mine ? '我' : (m.author || '群友')}</span>
          <span className="muted group-activity-time">
            {m.pending ? '发送中…' : m.sendFailed ? '发送失败' : formatMsgTime(m.created_at)}
          </span>
        </div>
        {dueLabel && <span className="group-task-due-badge">{dueLabel}</span>}
      </div>

      {replyPreview ? (
        <button
          type="button"
          className="group-msg-reply-quote is-tappable"
          disabled={!replyPreview.id}
          onClick={() => {
            if (replyPreview.id) focusMessageById(replyPreview.id);
          }}
        >
          <span className="muted">{replyPreview.author}</span>
          <p>{replyPreview.snippet}</p>
        </button>
      ) : null}

      {isTaskDone && completeTitle && (
        <p className="group-activity-task-done">
          已完成 · <strong>{completeTitle}</strong>
        </p>
      )}

      <ImMessageBody body={bodyForRender} ref={m.ref} kind={m.kind} mentions={m.mentions} />

      {m.attachments && m.attachments.length > 0 ? (
        <div className="group-msg-attach">
          {m.attachments.map((a) => {
            const href = a.url ? contentAssetUrl(a.url) : null;
            const isImg = (a.mime || '').startsWith('image/') || m.kind === 'image';
            if (isImg && href) {
              return (
                <a key={a.id} href={href} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={href} alt={a.file_name || '图片'} />
                </a>
              );
            }
            return href ? (
              <a key={a.id} href={href} target="_blank" rel="noreferrer">
                {a.file_name || '附件'}
              </a>
            ) : (
              <span key={a.id}>{a.file_name || '附件'}</span>
            );
          })}
        </div>
      ) : null}

      {isTask && m.task_id && onCompleteTask && !m.mine && (
        <div className="group-task-actions">
          {m.my_task_done ? (
            <span className="group-task-done">已完成 ✓</span>
          ) : (
            <>
              {refHref && (
                <Link href={`${refHref}&taskTitle=${encodeURIComponent(m.body || '任务')}`} className="font-pill" onClick={beforeReader}>
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
      )}

      {reactTotal > 0 && !showRespond ? (
        <div className="group-emoji-bar group-emoji-bar-summary">
          {Object.entries(m.reactions || {})
            .filter(([, users]) => users.length > 0)
            .slice(0, 6)
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

      <div className="group-activity-foot">
        {m.sendFailed && onResend && m.kind === 'chat' && m.body ? (
          <button type="button" className="text-link" onClick={() => onResend(m)}>重发</button>
        ) : null}
        {m.sendFailed ? (
          <button type="button" className="text-link danger" onClick={() => onDelete(m.id)}>删除</button>
        ) : null}
        {!m.pending && !m.sendFailed ? (
          <button type="button" className="text-link" onClick={() => setShowRespond((v) => !v)}>
            回应{reactTotal > 0 ? ` (${reactTotal})` : ''}
          </button>
        ) : null}
        {onReply && !m.pending && !m.sendFailed && isChatLite ? (
          <button type="button" className="text-link" onClick={() => onReply(m)}>回复</button>
        ) : null}
        {!m.pending && !m.sendFailed && !m.recalled && (m.body || m.ref) ? (
          <button
            type="button"
            className="text-link"
            onClick={() => void copyMessageText([m.ref ? formatGroupRefLabel(m.ref) : null, m.body])}
          >
            复制
          </button>
        ) : null}
        {m.kind === 'checkin' && m.ref && (
          <button type="button" className="text-link" onClick={shareMessageCard}>分享</button>
        )}
        {showRecall && onRecall && !m.pending ? (
          <button type="button" className="text-link danger" onClick={() => onRecall(m.id)}>撤回</button>
        ) : null}
        {(m.mine || isOwner) && !m.pending && (
          <button type="button" className="text-link danger" onClick={() => onDelete(m.id)}>删除</button>
        )}
        {!m.mine && !m.pending && (
          <button type="button" className="text-link" onClick={() => onReport(m.id)}>举报</button>
        )}
      </div>

      {showRespond && (
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
                  {e}{count > 0 ? ` ${count}` : ''}
                </button>
              );
            })}
            <button type="button" className="group-emoji-btn muted-more" onClick={() => setShowCanned((v) => !v)}>
              {showCanned ? '收起' : '更多'}
            </button>
          </div>
          {showCanned && (
            <>
              <div className="group-emoji-bar">
                {GROUP_EMOJIS.slice(3).map((e) => {
                  const count = m.reactions[e]?.length || 0;
                  return (
                    <button
                      key={e}
                      type="button"
                      className={`group-emoji-btn${count > 0 ? ' active' : ''}`}
                      onClick={() => onReact(m.id, e)}
                    >
                      {e}{count > 0 ? ` ${count}` : ''}
                    </button>
                  );
                })}
              </div>
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
                      {cannedPhraseLabel(p.key)}{count > 0 ? ` ${count}` : ''}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </article>
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
  const todayKey = localDayKey(new Date());
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [todayExpanded, setTodayExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<FeedFilter>('all');

  const filteredMessages = useMemo(
    () => messages.filter((m) => matchesFeedFilter(m, filter)),
    [messages, filter],
  );

  const byId = useMemo(() => {
    const map = new Map<string, GroupMessage>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  const dayGroups = useMemo(() => {
    const map = new Map<string, GroupMessage[]>();
    for (const m of filteredMessages) {
      const key = localDayKey(m.created_at);
      const list = map.get(key) ?? [];
      list.push(m);
      map.set(key, list);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([dayKey, items]) => {
        const sorted = [...items].sort((a, b) => b.created_at.localeCompare(a.created_at));
        return [dayKey, dedupeMilestones(sorted)] as const;
      });
  }, [filteredMessages]);

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
      <div className="group-activity-empty">
        <div className="group-empty-icon" aria-hidden>📖</div>
        <strong>还没有动态</strong>
        <p className="muted">完成今日阅读后，来发第一条打卡吧。</p>
        {onOpenComposer && (
          <button type="button" className="btn" onClick={onOpenComposer}>
            发第一条打卡
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="group-activity-feed">
      <div className="group-activity-feed-title">
        <strong>动态</strong>
        <span className="muted group-activity-feed-hint">时间线</span>
      </div>
      <div className="group-feed-filters im-feed-filters" role="tablist" aria-label="时间线筛选">
        {FEED_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            className={`mode-chip ${filter === f.id ? 'mode-chip-active' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filteredMessages.length === 0 ? (
        <p className="muted" style={{ margin: '12px 0 8px', lineHeight: 1.5 }}>
          {filter === 'file'
            ? '暂无图片或文件。'
            : filter === 'checkin_task'
              ? '暂无打卡或任务。'
              : '暂无消息。'}
        </p>
      ) : null}

      {dayGroups.map(([dayKey, items]) => {
        const isToday = dayKey === todayKey;
        const isCollapsed = isToday ? false : (collapsed[dayKey] ?? true);
        const visibleItems =
          isToday && !todayExpanded && items.length > TODAY_PREVIEW
            ? items.slice(0, TODAY_PREVIEW)
            : items;

        return (
          <section
            key={dayKey}
            className={`group-activity-day${isToday ? ' is-today' : ''}${isCollapsed ? ' is-collapsed' : ''}`}
          >
            {!isToday && (
              <button
                type="button"
                className="group-activity-day-toggle"
                onClick={() => setCollapsed((prev) => ({ ...prev, [dayKey]: !isCollapsed }))}
              >
                <span>{dayLabel(dayKey)}</span>
                <span className="muted">{items.length} 条 · {isCollapsed ? '展开' : '收起'}</span>
              </button>
            )}

            {isToday && (
              <div className="group-activity-day-label">
                <span>{dayLabel(dayKey)}</span>
                <span className="muted">{items.length} 条</span>
              </div>
            )}

            {!isCollapsed && (
              <div className="group-timeline">
                <div className="group-timeline-line" aria-hidden />
                <div className="group-timeline-items">
                  {visibleItems.map((m, idx) => {
                    if (m.kind === 'system') {
                      return (
                        <div key={m.id} className="group-timeline-item center">
                          <div className="group-timeline-dot system" />
                          <div className="group-system-bubble">
                            <span
                              className={
                                m.body?.includes('全员打卡') || m.body?.includes('里程碑')
                                  ? 'milestone'
                                  : undefined
                              }
                            >
                              {m.body}
                            </span>
                          </div>
                        </div>
                      );
                    }
                    const side = idx % 2 === 0 ? 'left' : 'right';
                    const parent = m.reply_to_id ? byId.get(m.reply_to_id) : undefined;
                    const replyPreview = parent
                      ? {
                          id: parent.id,
                          author: parent.mine ? '我' : parent.author || '群友',
                          snippet: parent.recalled
                            ? '消息已撤回'
                            : replySnippet(
                                parent.body,
                                parent.kind,
                                parent.attachments?.[0]?.file_name,
                              ),
                        }
                      : m.reply_to_id
                        ? { author: '原消息', snippet: '（暂未加载）' }
                        : null;
                    return (
                      <div key={m.id} className={`group-timeline-item ${side}`}>
                        <div className="group-timeline-dot" />
                        <div className="group-timeline-card-wrap">
                          <ActivityCard
                            gid={gid}
                            m={m}
                            isOwner={isOwner}
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
                      </div>
                    );
                  })}
                </div>
                {isToday && items.length > TODAY_PREVIEW && (
                  <button
                    type="button"
                    className="text-link group-today-expand"
                    onClick={() => setTodayExpanded((v) => !v)}
                  >
                    {todayExpanded ? '收起今天较早动态' : `展开今天全部 ${items.length} 条`}
                  </button>
                )}
              </div>
            )}
          </section>
        );
      })}

      <div ref={loadMoreRef} className="group-feed-load-sentinel" aria-hidden>
        {loadingMore && <span className="muted">加载更早动态…</span>}
        {!hasMore && <span className="muted">没有更早动态了</span>}
      </div>
    </div>
  );
}
