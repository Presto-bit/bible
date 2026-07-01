'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  api,
  type GroupDetail,
  type GroupMessage,
} from '@/lib/api';

const EMOJIS = ['🙏', '❤️', '👍', '🔥'];

export default function GroupPage() {
  const params = useParams<{ id: string }>();
  const gid = params.id;
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [feed, setFeed] = useState<GroupMessage[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [d, f] = await Promise.all([api.groupDetail(gid), api.groupFeed(gid)]);
      setDetail(d);
      setFeed(f.messages);
      setErr(null);
    } catch (e) {
      setErr(String(e));
    }
  }, [gid]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (err) return <main className="container"><p className="muted">{err}</p></main>;
  if (!detail) return <main className="container"><p className="muted">加载中…</p></main>;

  const isOwner = detail.role === 'owner';

  const newTask = async () => {
    const title = prompt('任务内容（仅群主）');
    if (!title) return;
    const ref = prompt('关联经文（可选，如 JHN.3.16）') || undefined;
    try {
      await api.createTask(gid, title, ref);
      reload();
    } catch (e) {
      alert(`发布失败：${e}`);
    }
  };

  const checkinWithTask = async (taskId: string, title: string) => {
    const body = prompt(`打卡：${title}\n写点感想（可选）`) ?? '';
    try {
      await api.checkin(gid, { task_id: taskId, body });
      reload();
    } catch (e) {
      alert(`打卡失败：${e}`);
    }
  };

  const checkinWithRef = async () => {
    const ref = prompt('打卡关联经文（如 JHN.3.16）');
    if (!ref) return;
    const body = prompt('写点感想（可选）') ?? '';
    try {
      await api.checkin(gid, { ref, body });
      reload();
    } catch (e) {
      alert(`打卡失败（须挂经文或任务）：${e}`);
    }
  };

  const react = async (mid: string, emoji: string) => {
    try {
      await api.react(mid, emoji);
      reload();
    } catch {
      /* ignore */
    }
  };

  const reportMsg = async (mid: string) => {
    const reason = prompt('举报原因（可选）') ?? '';
    try {
      const r = await api.reportMessage(mid, reason);
      alert(r.hidden ? '已举报，该内容已被隐藏待复核' : '已举报，感谢反馈');
      reload();
    } catch (e) {
      alert(`举报失败：${e}`);
    }
  };

  const deleteMsg = async (mid: string) => {
    if (!confirm('确定删除这条内容？')) return;
    try {
      await api.deleteMessage(mid);
      reload();
    } catch (e) {
      alert(`删除失败：${e}`);
    }
  };

  return (
    <main className="container">
      <h2 className="page-title">{detail.name}</h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        {detail.members.length} 人 · 邀请码 {detail.join_code} ·{' '}
        {isOwner ? '群主' : '成员'}
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className="btn" style={{ marginTop: 0 }} onClick={checkinWithRef}>
          经文打卡
        </button>
        {isOwner && (
          <button
            className="btn"
            style={{ marginTop: 0, background: 'var(--gold)' }}
            onClick={newTask}
          >
            + 发任务
          </button>
        )}
      </div>

      {detail.tasks.length > 0 && (
        <>
          <h3 style={{ margin: '6px 0' }}>任务</h3>
          {detail.tasks.map((t) => (
            <div key={t.id} className="card" style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  {t.title}
                  {t.ref && <span className="muted"> · {t.ref}</span>}
                </div>
                <button
                  className="book-chip"
                  style={{ width: 'auto' }}
                  onClick={() => checkinWithTask(t.id, t.title)}
                >
                  去打卡
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      <h3 style={{ margin: '16px 0 6px' }}>动态</h3>
      {feed.length === 0 ? (
        <p className="muted">还没有打卡，来发第一条吧。</p>
      ) : (
        feed.map((m) => (
          <div key={m.id} className="card" style={{ marginBottom: 8 }}>
            <div className="muted" style={{ marginBottom: 4 }}>
              {m.author} · {m.kind === 'checkin' ? '打卡' : m.kind}
              {m.ref ? ` · ${m.ref}` : ''}
            </div>
            {m.body && <div>{m.body}</div>}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {EMOJIS.map((e) => {
                const count = m.reactions[e]?.length || 0;
                return (
                  <button
                    key={e}
                    className="book-chip"
                    style={{ width: 'auto', padding: '4px 8px' }}
                    onClick={() => react(m.id, e)}
                  >
                    {e} {count > 0 ? count : ''}
                  </button>
                );
              })}
              <span style={{ flex: 1 }} />
              {(m.mine || isOwner) && (
                <button
                  className="text-link"
                  style={{ color: '#b1554a', fontSize: 12 }}
                  onClick={() => deleteMsg(m.id)}
                >
                  删除
                </button>
              )}
              {!m.mine && (
                <button
                  className="text-link"
                  style={{ color: 'var(--ink-faint)', fontSize: 12 }}
                  onClick={() => reportMsg(m.id)}
                >
                  举报
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </main>
  );
}
