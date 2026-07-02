'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { GroupMessage } from '@/lib/api';
import { readerHrefFromRef } from '@/lib/group_footprint';
import {
  GROUP_CANNED_PHRASES,
  GROUP_EMOJIS,
  cannedPhraseLabel,
} from '@/lib/group_reactions';
import { formatDueCountdown } from '@/lib/group_ui';
import { shareCard } from '@/lib/share_card';
import { BRAND_NAME } from '@/lib/brand';

function dayLabel(dayKey: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dayKey === today) return '今天';
  if (dayKey === yesterday) return '昨天';
  return dayKey.replace(/-/g, '/');
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '';
  }
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

type CardProps = {
  gid: string;
  m: GroupMessage;
  isOwner: boolean;
  onReact: (mid: string, emoji: string) => void;
  onReport: (mid: string) => void;
  onDelete: (mid: string) => void;
  onCompleteTask?: (taskId: string, title: string, ref?: string | null) => void;
};

function ActivityCard({
  gid,
  m,
  isOwner,
  onReact,
  onReport,
  onDelete,
  onCompleteTask,
}: CardProps) {
  const [showRespond, setShowRespond] = useState(false);
  const isTask = m.kind === 'task';
  const isTaskDone = isTaskCompleteCheckin(m);
  const kindLabel = isTask ? '任务' : isTaskDone ? '任务完成' : '打卡';
  const dueLabel = isTask ? formatDueCountdown(m.task_due_at) : null;
  const completeTitle = isTaskDone ? taskCompleteTitle(m.body) : null;
  const refHref = m.ref ? readerHrefFromRef(m.ref) : null;

  const shareMessageCard = async () => {
    const title = m.ref ? `今日打卡 · ${m.ref}` : '今日打卡';
    await shareCard({ title, body: m.body || '', footer: BRAND_NAME });
  };

  return (
    <article className={`group-activity-card group-activity-${isTask ? 'task' : isTaskDone ? 'task-done' : 'checkin'}`}>
      <div className="group-activity-card-head">
        <div className="group-activity-card-meta">
          <span className="group-activity-kind">{kindLabel}</span>
          <span className="group-activity-author">{m.mine ? '我' : (m.author || '群友')}</span>
          <span className="muted group-activity-time">{formatTime(m.created_at)}</span>
        </div>
        {dueLabel && <span className="group-task-due-badge">{dueLabel}</span>}
      </div>

      {isTaskDone && completeTitle && (
        <p className="group-activity-task-done">
          已完成 · <strong>{completeTitle}</strong>
        </p>
      )}

      {m.ref && (
        refHref ? (
          <Link href={refHref} className="group-ref-card">
            <span className="group-ref-card-label">经文</span>
            <strong>{m.ref}</strong>
          </Link>
        ) : (
          <div className="group-ref-card static">
            <span className="group-ref-card-label">经文</span>
            <strong>{m.ref}</strong>
          </div>
        )
      )}

      {m.body && !isTaskDone && <p className="group-activity-body">{m.body}</p>}
      {m.body && isTaskDone && (() => {
        const extra = m.body.replace(/^已完成任务·[^·]+(?: · )?/, '').trim();
        return extra ? <p className="group-activity-body">{extra}</p> : null;
      })()}

      {isTask && m.task_id && onCompleteTask && !m.mine && (
        <div className="group-task-actions">
          {m.my_task_done ? (
            <span className="group-task-done">已完成 ✓</span>
          ) : (
            <>
              {m.ref && readerHrefFromRef(m.ref, { group: gid, task: m.task_id }) && (
                <Link
                  href={`${readerHrefFromRef(m.ref, { group: gid, task: m.task_id })}&taskTitle=${encodeURIComponent(m.body || '任务')}`}
                  className="font-pill"
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
      )}

      <div className="group-activity-foot">
        <button type="button" className="text-link" onClick={() => setShowRespond((v) => !v)}>
          回应{reactionCount(m.reactions) > 0 ? ` (${reactionCount(m.reactions)})` : ''}
        </button>
        {m.kind === 'checkin' && m.ref && (
          <button type="button" className="text-link" onClick={shareMessageCard}>分享</button>
        )}
        {(m.mine || isOwner) && (
          <button type="button" className="text-link danger" onClick={() => onDelete(m.id)}>删除</button>
        )}
        {!m.mine && (
          <button type="button" className="text-link" onClick={() => onReport(m.id)}>举报</button>
        )}
      </div>

      {showRespond && (
        <div className="group-activity-respond">
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
  onCompleteTask?: (taskId: string, title: string, ref?: string | null) => void;
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
  onCompleteTask,
}: Props) {
  const todayKey = new Date().toISOString().slice(0, 10);

  const dayGroups = useMemo(() => {
    const map = new Map<string, GroupMessage[]>();
    for (const m of messages) {
      const key = m.created_at.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(m);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [messages]);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

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
        <span className="muted" style={{ fontSize: 12 }}>按天查看</span>
      </div>

      {hasMore && onLoadMore && (
        <button type="button" className="group-load-more" disabled={loadingMore} onClick={onLoadMore}>
          {loadingMore ? '加载中…' : '加载更早动态'}
        </button>
      )}

      {dayGroups.map(([dayKey, items]) => {
        const isCollapsed = collapsed[dayKey] ?? dayKey !== todayKey;
        return (
          <section key={dayKey} className="group-activity-day">
            <button
              type="button"
              className="group-activity-day-toggle"
              onClick={() => setCollapsed((prev) => ({ ...prev, [dayKey]: !isCollapsed }))}
            >
              <span>{dayLabel(dayKey)}</span>
              <span className="muted">{items.length} 条 · {isCollapsed ? '展开' : '收起'}</span>
            </button>
            {!isCollapsed && (
              <div className="group-activity-day-list">
                {items.map((m) => {
                  if (m.kind === 'system') {
                    return (
                      <div key={m.id} className="group-system-bubble">
                        <span className={m.body?.includes('全员打卡') ? 'milestone' : undefined}>{m.body}</span>
                      </div>
                    );
                  }
                  return (
                    <ActivityCard
                      key={m.id}
                      gid={gid}
                      m={m}
                      isOwner={isOwner}
                      onReact={onReact}
                      onReport={onReport}
                      onDelete={onDelete}
                      onCompleteTask={onCompleteTask}
                    />
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
