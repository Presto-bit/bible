'use client';

import { useEffect, useState } from 'react';
import type { GroupTask } from '@/lib/api';
import { GROUP_CHECKIN_CHIPS, GROUP_CHECKIN_DEFAULT_BODY } from '@/lib/group_checkin';
import { GROUP_TASK_TEMPLATES } from '@/lib/group_task_templates';
import { loadFootprintRefs, type FootprintRef } from '@/lib/group_footprint';
import { shareCard } from '@/lib/share_card';
import { BRAND_NAME } from '@/lib/brand';

type Mode = 'checkin' | 'task';

type Props = {
  isOwner: boolean;
  tasks: GroupTask[];
  busy?: boolean;
  onCheckin: (payload: { ref?: string; task_id?: string; body?: string }) => Promise<void>;
  onCreateTask: (payload: {
    title: string;
    ref?: string;
    due_at?: string;
    template_id?: string;
  }) => Promise<void>;
};

export function GroupComposer({
  isOwner,
  tasks,
  busy = false,
  onCheckin,
  onCreateTask,
}: Props) {
  const [mode, setMode] = useState<Mode>('checkin');
  const [footprints, setFootprints] = useState<FootprintRef[]>([]);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [customRef, setCustomRef] = useState('');
  const [body, setBody] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskRef, setTaskRef] = useState('');
  const [taskDueDays, setTaskDueDays] = useState(3);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    loadFootprintRefs().then(setFootprints);
  }, []);

  const openTasks = tasks.filter((t) => !t.completed);
  const effectiveRef = selectedRef || customRef.trim() || null;
  const canSendCheckin = Boolean(effectiveRef || selectedTaskId);
  const canSendTask = taskTitle.trim().length > 0;

  const resetCheckin = () => {
    setSelectedRef(null);
    setSelectedTaskId(null);
    setCustomRef('');
    setBody('');
    setErr(null);
  };

  const sendCheckin = async () => {
    if (!canSendCheckin || busy) return;
    setErr(null);
    try {
      await onCheckin({
        ref: effectiveRef || undefined,
        task_id: selectedTaskId || undefined,
        body: body.trim() || GROUP_CHECKIN_DEFAULT_BODY,
      });
      resetCheckin();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const shareCheckinCard = async () => {
    const text = body.trim() || GROUP_CHECKIN_DEFAULT_BODY;
    const title = effectiveRef ? `今日打卡 · ${effectiveRef}` : '今日打卡';
    await shareCard({ title, body: text, footer: BRAND_NAME });
  };

  const sendTask = async () => {
    if (!canSendTask || busy) return;
    setErr(null);
    try {
      await onCreateTask({
        title: taskTitle.trim(),
        ref: taskRef.trim() || undefined,
        due_at: new Date(Date.now() + taskDueDays * 86400000).toISOString(),
        template_id: undefined,
      });
      setTaskTitle('');
      setTaskRef('');
      setMode('checkin');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="group-composer">
      <div className="group-composer-tabs">
        <button
          type="button"
          className={mode === 'checkin' ? 'active' : ''}
          onClick={() => setMode('checkin')}
        >
          打卡
        </button>
        {isOwner && (
          <button
            type="button"
            className={mode === 'task' ? 'active' : ''}
            onClick={() => setMode('task')}
          >
            发布任务
          </button>
        )}
      </div>

      {mode === 'checkin' ? (
        <>
          {openTasks.length > 0 && (
            <div className="group-composer-section">
              <div className="group-composer-label">关联任务</div>
              <div className="group-chip-row">
                {openTasks.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`group-chip${selectedTaskId === t.id ? ' selected' : ''}`}
                    onClick={() => {
                      setSelectedTaskId(selectedTaskId === t.id ? null : t.id);
                      if (selectedTaskId !== t.id) setSelectedRef(null);
                    }}
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="group-composer-section">
            <div className="group-composer-label">关联经文</div>
            {footprints.length > 0 ? (
              <div className="group-chip-row">
                {footprints.map((f) => (
                  <button
                    key={`${f.source}-${f.ref}`}
                    type="button"
                    className={`group-chip${selectedRef === f.ref ? ' selected' : ''}`}
                    onClick={() => {
                      setSelectedRef(selectedRef === f.ref ? null : f.ref);
                      if (selectedRef !== f.ref) setSelectedTaskId(null);
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ fontSize: 12, margin: '4px 0' }}>
                读经或收藏经节后，会出现在这里供快速关联。
              </p>
            )}
            <input
              className="search-input"
              style={{ marginTop: 8 }}
              placeholder="或手动输入经节，如 JHN.3.16"
              value={customRef}
              onChange={(e) => {
                setCustomRef(e.target.value);
                if (e.target.value.trim()) {
                  setSelectedRef(null);
                  setSelectedTaskId(null);
                }
              }}
            />
          </div>

          <textarea
            className="group-composer-text"
            placeholder="写点感想（可选）"
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />

          <div className="group-chip-row" style={{ marginBottom: 8 }}>
            {GROUP_CHECKIN_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                className={`group-chip${body === chip ? ' selected' : ''}`}
                onClick={() => setBody(body === chip ? '' : chip)}
              >
                {chip}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn group-composer-send"
              style={{ flex: 1 }}
              disabled={!canSendCheckin || busy}
              onClick={sendCheckin}
            >
              {busy ? '发送中…' : '发送打卡'}
            </button>
            <button
              type="button"
              className="font-pill"
              style={{ flexShrink: 0 }}
              disabled={!canSendCheckin || busy}
              onClick={shareCheckinCard}
            >
              分享图
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="group-chip-row" style={{ marginBottom: 8 }}>
            {GROUP_TASK_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                className="group-chip"
                onClick={() => {
                  setTaskTitle(t.title);
                  setTaskRef(t.ref || '');
                }}
              >
                {t.title}
              </button>
            ))}
          </div>
          <input
            className="search-input"
            placeholder="任务内容"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
          />
          <input
            className="search-input"
            style={{ marginTop: 8 }}
            placeholder="关联经文（可选，如 JHN.3.16）"
            value={taskRef}
            onChange={(e) => setTaskRef(e.target.value)}
          />
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            截止：{taskDueDays} 天后
            <input
              type="range"
              min={1}
              max={14}
              value={taskDueDays}
              onChange={(e) => setTaskDueDays(Number(e.target.value))}
              style={{ width: '100%', marginTop: 4 }}
            />
          </p>
          <button
            type="button"
            className="btn group-composer-send"
            style={{ background: 'var(--gold)' }}
            disabled={!canSendTask || busy}
            onClick={sendTask}
          >
            {busy ? '发布中…' : '发布任务'}
          </button>
        </>
      )}

      {err && <p className="group-composer-err" role="alert">{err}</p>}
      <p className="group-composer-hint muted">群内仅支持发送「打卡 / 任务」，不支持自由聊天</p>
    </div>
  );
}
