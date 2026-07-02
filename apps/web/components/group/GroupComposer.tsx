'use client';

import { useEffect, useState } from 'react';
import type { GroupTask } from '@/lib/api';
import { GROUP_CHECKIN_CHIPS, GROUP_CHECKIN_DEFAULT_BODY } from '@/lib/group_checkin';
import { GROUP_TASK_TEMPLATES } from '@/lib/group_task_templates';
import { loadFootprintRefs, type FootprintRef } from '@/lib/group_footprint';
import { groupFootprintsBySource } from '@/lib/group_ui';
import { shareCard } from '@/lib/share_card';
import { BRAND_NAME } from '@/lib/brand';

type Mode = 'checkin' | 'task';

type Props = {
  gid?: string;
  isOwner: boolean;
  tasks: GroupTask[];
  busy?: boolean;
  groupName?: string;
  onCheckin: (payload: { ref?: string; task_id?: string; body?: string }) => Promise<void>;
  onCreateTask: (payload: {
    title: string;
    ref?: string;
    due_at?: string;
    template_id?: string;
  }) => Promise<void>;
};

export function GroupComposer({
  gid,
  isOwner,
  tasks = [],
  busy = false,
  groupName,
  onCheckin,
  onCreateTask,
}: Props) {
  const [mode, setMode] = useState<Mode>('checkin');
  const [footprints, setFootprints] = useState<FootprintRef[]>([]);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskRef, setTaskRef] = useState('');
  const [taskDueDays, setTaskDueDays] = useState(3);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    const taskId = params.get('task');
    const taskTitle = params.get('taskTitle');
    const book = params.get('book');
    const chapter = params.get('chapter');
    const verse = params.get('verse');
    const taskRef =
      book && chapter
        ? `${book}.${chapter}${verse ? `.${verse}` : ''}`
        : params.get('ref') || undefined;
    loadFootprintRefs({
      taskRef,
      taskTitle: taskTitle || undefined,
    }).then((refs) => {
      setFootprints(refs);
      const fromTask = refs.find((f) => f.source === 'task');
      if (fromTask) {
        setSelectedRef(fromTask.ref);
      }
      if (taskId) {
        setSelectedTaskId(taskId);
      }
    });
  }, [gid]);

  const openTasks = tasks.filter((t) => !t.completed);
  const effectiveRef = selectedRef;
  const canSendCheckin = Boolean(effectiveRef || selectedTaskId);
  const canSendTask = taskTitle.trim().length > 0;

  const resetCheckin = () => {
    setSelectedRef(null);
    setSelectedTaskId(null);
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
    await shareCard({
      title,
      body: text,
      footer: BRAND_NAME,
      subtitle: groupName,
    });
  };

  const footprintGroups = groupFootprintsBySource(footprints);

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
              <div className="chip-swipe group-chip-swipe">
                {openTasks.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`group-chip chip-swipe-item${selectedTaskId === t.id ? ' selected' : ''}`}
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
            {footprintGroups.length > 0 ? (
              footprintGroups.map((g) => (
                <div key={g.source} className="group-footprint-group">
                  <span className="group-footprint-source">{g.label}</span>
                  <div className="chip-swipe group-chip-swipe">
                    {g.items.map((f) => (
                      <button
                        key={`${f.source}-${f.ref}`}
                        type="button"
                        className={`group-chip chip-swipe-item${selectedRef === f.ref ? ' selected' : ''}`}
                        onClick={() => {
                          setSelectedRef(selectedRef === f.ref ? null : f.ref);
                          if (selectedRef !== f.ref) setSelectedTaskId(null);
                        }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="muted" style={{ fontSize: 12, margin: '4px 0' }}>
                读经或收藏经节后，会出现在这里供快速关联。
              </p>
            )}
          </div>

          <div className="group-composer-section">
            <div className="group-composer-label">快捷感想</div>
            <div className="chip-swipe group-chip-swipe">
              {GROUP_CHECKIN_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className={`group-chip chip-swipe-item${body === chip ? ' selected' : ''}`}
                  onClick={() => setBody(body === chip ? '' : chip)}
                >
                  {chip}
                </button>
              ))}
            </div>
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
          <div className="chip-swipe group-chip-swipe" style={{ marginBottom: 8 }}>
            {GROUP_TASK_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                className="group-chip chip-swipe-item"
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
