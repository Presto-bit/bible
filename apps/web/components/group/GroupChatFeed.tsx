'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { GroupMessage } from '@/lib/api';
import { readerHrefFromRef } from '@/lib/group_footprint';
import { formatGroupRefLabel } from '@/lib/ref_label';
import {
  GROUP_CANNED_PHRASES,
  GROUP_EMOJIS,
  cannedPhraseLabel,
  isCannedPhrase,
} from '@/lib/group_reactions';
import { formatDueCountdown } from '@/lib/group_ui';
import { shareCard } from '@/lib/share_card';
import { BRAND_NAME } from '@/lib/brand';

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (sameDay) return hm;
    return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
  } catch {
    return '';
  }
}

function reactionCount(reactions: Record<string, string[]> | null | undefined): number {
  if (!reactions) return 0;
  return Object.values(reactions).reduce((n, users) => n + users.length, 0);
}

function formatReactions(reactions: Record<string, string[]> | null | undefined): string {
  if (!reactions) return '';
  const parts: string[] = [];
  for (const [key, users] of Object.entries(reactions)) {
    if (!users.length) continue;
    if (isCannedPhrase(key)) {
      parts.push(`${cannedPhraseLabel(key)} ${users.length}`);
    } else {
      parts.push(`${key} ${users.length}`);
    }
  }
  return parts.join(' · ');
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

type BubbleProps = {
  gid: string;
  m: GroupMessage;
  isOwner: boolean;
  onReact: (mid: string, emoji: string) => void;
  onReport: (mid: string) => void;
  onDelete: (mid: string) => void;
  onCompleteTask?: (taskId: string, title: string, ref?: string | null) => void;
};

function FeedBubble({
  gid,
  m,
  isOwner,
  onReact,
  onReport,
  onDelete,
  onCompleteTask,
}: BubbleProps) {
  const [showRespond, setShowRespond] = useState(false);
  const isTask = m.kind === 'task';
  const isTaskDone = isTaskCompleteCheckin(m);
  const kindLabel = isTask ? '任务' : isTaskDone ? '任务完成' : '打卡';
  const dueLabel = isTask ? formatDueCountdown(m.task_due_at) : null;
  const completeTitle = isTaskDone ? taskCompleteTitle(m.body) : null;
  const refLabel = m.ref ? formatGroupRefLabel(m.ref) : '';
  const refHref = m.ref ? readerHrefFromRef(m.ref) : null;

  const shareMessageCard = async () => {
    const title = m.ref ? `今日打卡 · ${refLabel}` : '今日打卡';
    await shareCard({ title, body: m.body || '', footer: BRAND_NAME });
  };

  return (
    <div className={`group-bubble-row ${m.mine ? 'mine' : 'theirs'}`}>
      <div className={`group-bubble ${isTask ? 'task' : isTaskDone ? 'task-done' : 'checkin'}`}>
        {!m.mine && <div className="group-bubble-author">{m.author || '群友'}</div>}
        <div className="group-bubble-kind">
          {kindLabel}
          {dueLabel && <span className="group-task-due-badge">{dueLabel}</span>}
        </div>

        {m.ref && refHref && (
          <Link href={refHref} className="group-ref-card">
            <span className="group-ref-card-label">经文</span>
            <strong>{refLabel}</strong>
          </Link>
        )}
        {m.ref && !refHref && (
          <div className="group-ref-card static">
            <span className="group-ref-card-label">经文</span>
            <strong>{refLabel}</strong>
          </div>
        )}

        {isTaskDone && completeTitle && (
          <p className="group-task-complete-prefix">
            已完成任务 · <strong>{completeTitle}</strong>
          </p>
        )}

        {m.body && !isTaskDone && <div className="group-bubble-body">{m.body}</div>}
        {m.body && isTaskDone && (() => {
          const extra = m.body.replace(/^已完成任务·[^·]+(?: · )?/, '').trim();
          return extra ? <div className="group-bubble-body">{extra}</div> : null;
        })()}

        {isTask && m.task_id && onCompleteTask && !m.mine && (
          <div className="group-task-actions">
            {m.my_task_done ? (
              <span className="group-task-done">已完成并分享 ✓</span>
            ) : (
              <>
                {m.ref && readerHrefFromRef(m.ref, { group: gid, task: m.task_id }) && (
                  <Link
                    href={`${readerHrefFromRef(m.ref, { group: gid, task: m.task_id })}&taskTitle=${encodeURIComponent(m.body || '任务')}`}
                    className="font-pill"
                  >
                    去完成
                  </Link>
                )}
                <button
                  type="button"
                  className="font-pill accent"
                  onClick={() => onCompleteTask(m.task_id!, m.body || '任务', m.ref)}
                >
                  完成并分享
                </button>
              </>
            )}
          </div>
        )}

        <div className="group-bubble-foot">
          <span className="group-bubble-time">{formatTime(m.created_at)}</span>
          <button
            type="button"
            className="group-respond-toggle"
            onClick={() => setShowRespond((v) => !v)}
          >
            回应{reactionCount(m.reactions) > 0 ? ` (${reactionCount(m.reactions)})` : ''}
          </button>
        </div>

        {showRespond && (
          <>
            <div className="group-emoji-bar">
              {GROUP_EMOJIS.map((e) => {
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
                    {p.label}
                    {count > 0 ? ` ${count}` : ''}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="group-bubble-meta">
          {reactionCount(m.reactions) > 0 && (
            <span className="muted">{formatReactions(m.reactions)}</span>
          )}
          <span style={{ flex: 1 }} />
          {m.kind === 'checkin' && m.ref && (
            <button type="button" className="text-link" onClick={shareMessageCard}>
              分享图
            </button>
          )}
          {(m.mine || isOwner) && (
            <button type="button" className="text-link danger" onClick={() => onDelete(m.id)}>
              删除
            </button>
          )}
          {!m.mine && (
            <button type="button" className="text-link" onClick={() => onReport(m.id)}>
              举报
            </button>
          )}
        </div>
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
  onCompleteTask?: (taskId: string, title: string, ref?: string | null) => void;
};

export function GroupChatFeed({
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
  onCompleteTask,
}: Props) {
  if (messages.length === 0) {
    return (
      <div className="group-chat-empty">
        <div className="group-empty-icon" aria-hidden>📖</div>
        <strong>还没有动态</strong>
        <p className="muted">来发第一条打卡，开启共读之旅吧。</p>
        {onOpenComposer && (
          <button type="button" className="btn" onClick={onOpenComposer}>
            发第一条打卡
          </button>
        )}
      </div>
    );
  }

  let lastDay = '';

  return (
    <div className="group-chat-feed">
      {hasMore && onLoadMore && (
        <button
          type="button"
          className="group-load-more"
          disabled={loadingMore}
          onClick={onLoadMore}
        >
          {loadingMore ? '加载中…' : '加载更早消息'}
        </button>
      )}
      {messages.map((m) => {
        const dayKey = m.created_at.slice(0, 10);
        const showDay = dayKey !== lastDay;
        lastDay = dayKey;

        if (m.kind === 'system') {
          const isMilestone = Boolean(m.body?.includes('全员打卡'));
          return (
            <div key={m.id}>
              {showDay && (
                <div className="group-chat-day">
                  <span>{dayKey.replace(/-/g, '/')}</span>
                </div>
              )}
              <div className="group-system-bubble">
                <span className={isMilestone ? 'milestone' : undefined}>{m.body}</span>
              </div>
            </div>
          );
        }

        return (
          <div key={m.id}>
            {showDay && (
              <div className="group-chat-day">
                <span>{dayKey.replace(/-/g, '/')}</span>
              </div>
            )}
            <FeedBubble
              gid={gid}
              m={m}
              isOwner={isOwner}
              onReact={onReact}
              onReport={onReport}
              onDelete={onDelete}
              onCompleteTask={onCompleteTask}
            />
          </div>
        );
      })}
    </div>
  );
}
