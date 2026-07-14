'use client';

import { useEffect, useState } from 'react';
import { api, type GroupMember, type GroupTask } from '@/lib/api';
import { GROUP_CHECKIN_CHIPS, GROUP_CHECKIN_BODY_MAX, normalizeCheckinBody, buildCheckinRef } from '@/lib/group_checkin';
import {
  COMPLETION_RULE_OPTIONS,
  DEFAULT_RULE_BY_TYPE,
  DUE_PRESETS,
  GROUP_TASK_TEMPLATES,
  GROUP_TASK_TYPES,
  resolveDueAt,
  type DuePreset,
  type GroupCompletionRule,
  type GroupTaskType,
} from '@/lib/group_task_templates';
import { loadFootprintRefs, type FootprintRef } from '@/lib/group_footprint';
import { asGroupTasks, groupFootprintsBySource } from '@/lib/group_ui';
import { readGroupCheckinDraft } from '@/lib/group_checkin_draft';
import { getLastRead } from '@/lib/reading';

type Mode = 'checkin' | 'task';

export type CreateTaskPayload = {
  title: string;
  ref?: string;
  due_at?: string;
  template_id?: string;
  task_type?: string;
  completion_rule?: string;
  body?: string;
  publish_at?: string;
  assignee_ids?: string[];
  attachments?: Array<{
    file_name: string;
    mime_type: string;
    size_bytes: number;
    storage_path: string;
    url: string;
  }>;
  series_days?: number;
  series_due_hours?: number;
};

type Props = {
  gid?: string;
  isOwner: boolean;
  tasks: GroupTask[];
  members?: GroupMember[];
  busy?: boolean;
  groupName?: string;
  onCheckin: (payload: { ref?: string; task_id?: string; body?: string }) => Promise<void>;
  onCreateTask: (payload: CreateTaskPayload) => Promise<void>;
};

type PendingAttach = {
  file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  url: string;
};

export function GroupComposer({
  gid,
  isOwner,
  tasks = [],
  members = [],
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
  const [bodyNonce, setBodyNonce] = useState(0);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskRef, setTaskRef] = useState('');
  const [taskBody, setTaskBody] = useState('');
  const [taskType, setTaskType] = useState<GroupTaskType>('custom');
  const [completionRule, setCompletionRule] = useState<GroupCompletionRule>('checkin_text');
  const [duePreset, setDuePreset] = useState<DuePreset>('days3');
  const [templateId, setTemplateId] = useState<string | undefined>();
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<PendingAttach[]>([]);
  const [seriesDays, setSeriesDays] = useState(0);
  const [scheduleLater, setScheduleLater] = useState(false);
  const [publishLocal, setPublishLocal] = useState('');
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    const taskId = params.get('task');
    const taskTitleParam = params.get('taskTitle');
    const book = params.get('book');
    const chapter = params.get('chapter');
    const verse = params.get('verse');
    const taskRefParam =
      book && chapter
        ? `${book}.${chapter}${verse ? `.${verse}` : ''}`
        : params.get('ref') || undefined;
    const refParam = params.get('ref');
    if (refParam) {
      setSelectedRef(refParam);
    }
    if (gid) {
      const draft = readGroupCheckinDraft(gid);
      if (draft?.ref && !refParam && !taskRefParam) setSelectedRef(draft.ref);
      else if (!refParam && !taskRefParam) {
        const last = getLastRead();
        if (last) setSelectedRef(buildCheckinRef(last.bookId, last.chapter));
      }
      if (draft?.body) setBody(draft.body);
    }
    loadFootprintRefs({
      taskRef: taskRefParam,
      taskTitle: taskTitleParam || undefined,
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

  const openTasks = asGroupTasks(tasks).filter((t) => !t.completed);
  const effectiveRef = selectedRef;
  const canSendCheckin = Boolean(effectiveRef || selectedTaskId);
  const canSendTask = taskTitle.trim().length > 0 && !uploading;

  const resetCheckin = () => {
    setSelectedRef(null);
    setSelectedTaskId(null);
    setBody('');
    setBodyNonce((n) => n + 1);
    setErr(null);
  };

  const resetTaskForm = () => {
    setTaskTitle('');
    setTaskRef('');
    setTaskBody('');
    setTaskType('custom');
    setCompletionRule('checkin_text');
    setDuePreset('days3');
    setTemplateId(undefined);
    setAssigneeIds([]);
    setAttachments([]);
    setSeriesDays(0);
    setScheduleLater(false);
    setPublishLocal('');
  };

  const sendCheckin = async () => {
    if (!canSendCheckin || busy) return;
    setErr(null);
    try {
      await onCheckin({
        ref: effectiveRef || undefined,
        task_id: selectedTaskId || undefined,
        body: normalizeCheckinBody(body),
      });
      resetCheckin();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const footprintGroups = groupFootprintsBySource(footprints);

  const onBodyInput = (value: string) => {
    setBody(value.slice(0, GROUP_CHECKIN_BODY_MAX));
  };

  const applyType = (next: GroupTaskType) => {
    setTaskType(next);
    setCompletionRule(DEFAULT_RULE_BY_TYPE[next]);
  };

  const toggleAssignee = (uid: string) => {
    setAssigneeIds((prev) =>
      prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid],
    );
  };

  const onPickFiles = async (files: FileList | null) => {
    if (!files?.length || !gid) return;
    if (attachments.length >= 3) {
      setErr('最多 3 个附件');
      return;
    }
    setUploading(true);
    setErr(null);
    try {
      const next = [...attachments];
      for (const file of Array.from(files)) {
        if (next.length >= 3) break;
        const meta = await api.uploadTaskAttachment(gid, file);
        next.push({
          file_name: meta.file_name,
          mime_type: meta.mime_type,
          size_bytes: meta.size_bytes,
          storage_path: meta.storage_path,
          url: meta.url,
        });
      }
      setAttachments(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const sendTask = async () => {
    if (!canSendTask || busy) return;
    setErr(null);
    try {
      const publish_at =
        scheduleLater && publishLocal
          ? new Date(publishLocal).toISOString()
          : undefined;
      await onCreateTask({
        title: taskTitle.trim(),
        ref: taskRef.trim() || undefined,
        body: taskBody.trim() || undefined,
        due_at: resolveDueAt(duePreset),
        template_id: templateId,
        task_type: taskType,
        completion_rule: completionRule,
        publish_at,
        assignee_ids: assigneeIds.length ? assigneeIds : undefined,
        attachments: attachments.length ? attachments : undefined,
        series_days: seriesDays >= 2 ? seriesDays : undefined,
        series_due_hours: 24,
      });
      resetTaskForm();
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
                  onClick={() => onBodyInput(body === chip ? '' : chip)}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          <div className="group-composer-section group-composer-section-compose">
            <div className="group-composer-label-row">
              <span className="group-composer-label">写感想</span>
              <span className="muted group-composer-char-count">{body.length}/{GROUP_CHECKIN_BODY_MAX}</span>
            </div>
            <textarea
              key={bodyNonce}
              className="group-composer-text search-input compose-textarea"
              rows={3}
              placeholder="写下今天的感受（可选）"
              value={body}
              maxLength={GROUP_CHECKIN_BODY_MAX}
              onChange={(e) => onBodyInput(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="btn group-composer-send"
            style={{ width: '100%' }}
            disabled={!canSendCheckin || busy}
            onClick={sendCheckin}
          >
            {busy ? '发送中…' : '发送打卡'}
          </button>
        </>
      ) : (
        <>
          <div className="chip-swipe group-chip-swipe" style={{ marginBottom: 8 }}>
            {GROUP_TASK_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`group-chip chip-swipe-item${templateId === t.id ? ' selected' : ''}`}
                onClick={() => {
                  setTemplateId(t.id);
                  setTaskTitle(t.title);
                  setTaskRef(t.ref || '');
                  applyType(t.task_type);
                  setCompletionRule(t.completion_rule);
                }}
              >
                {t.title}
              </button>
            ))}
          </div>

          <div className="group-composer-section">
            <div className="group-composer-label">类型</div>
            <div className="chip-swipe group-chip-swipe">
              {GROUP_TASK_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`group-chip chip-swipe-item${taskType === t.id ? ' selected' : ''}`}
                  onClick={() => {
                    setTemplateId(undefined);
                    applyType(t.id);
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <input
            className="search-input"
            placeholder="任务标题"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
          />
          <input
            className="search-input"
            style={{ marginTop: 8 }}
            placeholder="关联经文（可选，如 JHN.3）"
            value={taskRef}
            onChange={(e) => setTaskRef(e.target.value)}
          />
          <textarea
            className="group-composer-text search-input compose-textarea"
            style={{ marginTop: 8 }}
            rows={2}
            placeholder="说明（可选）"
            value={taskBody}
            maxLength={2000}
            onChange={(e) => setTaskBody(e.target.value.slice(0, 2000))}
          />

          <div className="group-composer-section" style={{ marginTop: 10 }}>
            <div className="group-composer-label">截止</div>
            <div className="chip-swipe group-chip-swipe">
              {DUE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`group-chip chip-swipe-item${duePreset === p.id ? ' selected' : ''}`}
                  onClick={() => setDuePreset(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="group-composer-section">
            <div className="group-composer-label">完成标准</div>
            <div className="chip-swipe group-chip-swipe">
              {COMPLETION_RULE_OPTIONS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`group-chip chip-swipe-item${completionRule === r.id ? ' selected' : ''}`}
                  onClick={() => setCompletionRule(r.id)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {members.length > 0 && (
            <div className="group-composer-section">
              <div className="group-composer-label">指派（空=全群）</div>
              <div className="chip-swipe group-chip-swipe">
                {members
                  .filter((m) => m.user_id)
                  .map((m) => (
                    <button
                      key={m.user_id}
                      type="button"
                      className={`group-chip chip-swipe-item${assigneeIds.includes(m.user_id!) ? ' selected' : ''}`}
                      onClick={() => toggleAssignee(m.user_id!)}
                    >
                      {m.name}
                    </button>
                  ))}
              </div>
            </div>
          )}

          <div className="group-composer-section">
            <div className="group-composer-label-row">
              <span className="group-composer-label">附件（图片/PDF，最多 3）</span>
              <label className="font-pill" style={{ cursor: uploading ? 'wait' : 'pointer' }}>
                {uploading ? '上传中…' : '添加'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  multiple
                  hidden
                  disabled={uploading || attachments.length >= 3}
                  onChange={(e) => {
                    void onPickFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            {attachments.length > 0 && (
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12 }}>
                {attachments.map((a) => (
                  <li key={a.url}>
                    {a.file_name}
                    <button
                      type="button"
                      className="muted"
                      style={{ marginLeft: 8, border: 0, background: 'none', cursor: 'pointer' }}
                      onClick={() => setAttachments((prev) => prev.filter((x) => x.url !== a.url))}
                    >
                      移除
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="group-composer-section">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={seriesDays >= 2}
                onChange={(e) => setSeriesDays(e.target.checked ? 7 : 0)}
              />
              系列任务（按天解锁）
            </label>
            {seriesDays >= 2 && (
              <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                共{' '}
                <input
                  type="number"
                  min={2}
                  max={30}
                  value={seriesDays}
                  onChange={(e) => setSeriesDays(Math.max(2, Math.min(30, Number(e.target.value) || 2)))}
                  style={{ width: 52 }}
                />{' '}
                天 · 每天截止 24 小时
              </p>
            )}
          </div>

          <div className="group-composer-section">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={scheduleLater}
                onChange={(e) => setScheduleLater(e.target.checked)}
              />
              定时发布
            </label>
            {scheduleLater && (
              <input
                type="datetime-local"
                className="search-input"
                style={{ marginTop: 6 }}
                value={publishLocal}
                onChange={(e) => setPublishLocal(e.target.value)}
              />
            )}
          </div>

          <button
            type="button"
            className="btn group-composer-send"
            style={{ background: 'var(--gold)' }}
            disabled={!canSendTask || busy}
            onClick={sendTask}
          >
            {busy ? '发布中…' : seriesDays >= 2 ? `发布系列（${seriesDays} 天）` : scheduleLater ? '预约发布' : '发布任务'}
          </button>
          {groupName ? (
            <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>发布到「{groupName}」</p>
          ) : null}
        </>
      )}

      {err && <p className="group-composer-err" role="alert">{err}</p>}
      <p className="group-composer-hint muted">群内仅支持发送「打卡 / 任务」，不支持自由聊天</p>
    </div>
  );
}
