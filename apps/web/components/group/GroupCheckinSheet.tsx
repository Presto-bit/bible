'use client';

import { useEffect, useState } from 'react';
import { api, type Group } from '@/lib/api';
import {
  GROUP_CHECKIN_CHIPS,
  GROUP_CHECKIN_DEFAULT_BODY,
  chapterRef,
} from '@/lib/group_checkin';

type Props = {
  bookId: string;
  bookName: string;
  chapter: number;
  verse?: number | null;
  presetGroupId?: string | null;
  presetTaskId?: string | null;
  presetTaskTitle?: string | null;
  onClose: () => void;
  onDone?: () => void;
};

export default function GroupCheckinSheet({
  bookId,
  bookName,
  chapter,
  verse,
  presetGroupId,
  presetTaskId,
  presetTaskTitle,
  onClose,
  onDone,
}: Props) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [gid, setGid] = useState(presetGroupId || '');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const ref = chapterRef(bookId, chapter, verse ?? undefined);
  const label = verse ? `${bookName} ${chapter}:${verse}` : `${bookName} ${chapter}`;

  useEffect(() => {
    api
      .myGroups()
      .then((r) => {
        setGroups(r.groups);
        if (!presetGroupId && r.groups.length === 1) {
          setGid(r.groups[0].id);
        }
      })
      .catch(() => setGroups([]))
      .finally(() => setLoading(false));
  }, [presetGroupId]);

  const submit = async () => {
    if (!gid || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await api.checkin(gid, {
        ref,
        task_id: presetTaskId || undefined,
        body: body.trim() || GROUP_CHECKIN_DEFAULT_BODY,
      });
      onDone?.();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet card group-checkin-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="half-sheet-grab" aria-hidden />
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong>打卡到共读群</strong>
          <button type="button" className="text-link" onClick={onClose}>
            关闭
          </button>
        </div>
        <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
          关联经文：{label}（{ref}）
        </p>
        {presetTaskTitle && (
          <p className="group-checkin-task-hint">完成任务：{presetTaskTitle}</p>
        )}

        {loading ? (
          <p className="muted">加载群列表…</p>
        ) : groups.length === 0 ? (
          <div>
            <p className="muted">你还没有加入共读群。</p>
            <a href="/discover" className="font-pill" style={{ marginTop: 8, display: 'inline-block' }}>
              去发现创建或加入
            </a>
          </div>
        ) : (
          <>
            <label className="group-composer-label" htmlFor="group-pick">
              选择群
            </label>
            <select
              id="group-pick"
              className="search-input"
              value={gid}
              onChange={(e) => setGid(e.target.value)}
              disabled={Boolean(presetGroupId)}
            >
              <option value="">请选择共读群</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                  {g.my_checked_in_today ? ' · 今日已打卡' : ''}
                </option>
              ))}
            </select>

            <div className="group-composer-section" style={{ marginTop: 10 }}>
              <div className="group-composer-label">快捷感想（选填）</div>
              <div className="group-chip-row">
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
            </div>

            <textarea
              className="group-composer-text"
              rows={2}
              placeholder="写点感想（可选，留空则使用默认文案）"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />

            <button
              type="button"
              className="btn"
              style={{ width: '100%' }}
              disabled={!gid || busy}
              onClick={submit}
            >
              {busy ? '发送中…' : presetTaskId ? '完成并分享到群' : '发送打卡'}
            </button>
          </>
        )}
        {err && <p className="group-composer-err" role="alert">{err}</p>}
      </div>
    </div>
  );
}
