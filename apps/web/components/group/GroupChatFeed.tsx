'use client';

import Link from 'next/link';
import type { GroupMessage } from '@/lib/api';
import { readerHrefFromRef } from '@/lib/group_footprint';

const EMOJIS = ['🙏', '❤️', '👍', '🔥', '🙌'];

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

function reactionCount(reactions: Record<string, string[]>): number {
  return Object.values(reactions).reduce((n, users) => n + users.length, 0);
}

type Props = {
  gid: string;
  messages: GroupMessage[];
  isOwner: boolean;
  onReact: (mid: string, emoji: string) => void;
  onReport: (mid: string) => void;
  onDelete: (mid: string) => void;
  onCompleteTask?: (taskId: string, title: string, ref?: string | null) => void;
};

export function GroupChatFeed({
  gid,
  messages,
  isOwner,
  onReact,
  onReport,
  onDelete,
  onCompleteTask,
}: Props) {
  if (messages.length === 0) {
    return (
      <div className="group-chat-empty">
        <p className="muted">还没有动态，来发第一条打卡吧。</p>
      </div>
    );
  }

  let lastDay = '';

  return (
    <div className="group-chat-feed">
      {messages.map((m) => {
        const dayKey = m.created_at.slice(0, 10);
        const showDay = dayKey !== lastDay;
        lastDay = dayKey;

        const isTask = m.kind === 'task';
        const kindLabel = isTask ? '任务' : '打卡';

        return (
          <div key={m.id}>
            {showDay && (
              <div className="group-chat-day">
                <span>{dayKey.replace(/-/g, '/')}</span>
              </div>
            )}
            <div className={`group-bubble-row ${m.mine ? 'mine' : 'theirs'}`}>
              <div className={`group-bubble ${isTask ? 'task' : 'checkin'}`}>
                {!m.mine && (
                  <div className="group-bubble-author">{m.author}</div>
                )}
                <div className="group-bubble-kind">
                  {kindLabel}
                  {m.ref && (
                    <>
                      {' · '}
                      {readerHrefFromRef(m.ref) ? (
                        <Link href={readerHrefFromRef(m.ref)!} className="group-ref-link">
                          {m.ref}
                        </Link>
                      ) : (
                        m.ref
                      )}
                    </>
                  )}
                </div>
                {m.body && <div className="group-bubble-body">{m.body}</div>}
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
                  <div className="group-emoji-bar">
                    {EMOJIS.map((e) => {
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
                </div>
                <div className="group-bubble-meta">
                  {reactionCount(m.reactions) > 0 && (
                    <span className="muted">{reactionCount(m.reactions)} 个回应</span>
                  )}
                  <span style={{ flex: 1 }} />
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
          </div>
        );
      })}
    </div>
  );
}
