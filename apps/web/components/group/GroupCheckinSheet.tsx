'use client';

import { useEffect, useState } from 'react';
import { api, type Group } from '@/lib/api';
import {
  GROUP_CHECKIN_CHIPS,
  GROUP_CHECKIN_DEFAULT_BODY,
  chapterRef,
} from '@/lib/group_checkin';
import { getLastReadVerse } from '@/lib/reading';
import { formatGroupRefLabel } from '@/lib/ref_label';

type Props = {
  bookId: string;
  bookName: string;
  chapter: number;
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
  const [submitted, setSubmitted] = useState(false);

  const checkinRef = () => {
    const verse = getLastReadVerse(bookId, chapter);
    return chapterRef(bookId, chapter, verse ?? undefined);
  };

  const checkinLabel = () => {
    const ref = checkinRef();
    return formatGroupRefLabel(ref) || `${bookName} ${chapter}`;
  };

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

  const submit = async (quickBody?: string) => {
    if (!gid || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await api.checkin(gid, {
        ref: checkinRef(),
        task_id: presetTaskId || undefined,
        body: (quickBody ?? body).trim() || GROUP_CHECKIN_DEFAULT_BODY,
      });
      setSubmitted(true);
      onDone?.();
      window.setTimeout(onClose, 600);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet card group-checkin-sheet group-checkin-compact" onClick={(e) => e.stopPropagation()}>
        <div className="half-sheet-grab" aria-hidden />
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong style={{ fontSize: 15 }}>打卡到共读群</strong>
          <button type="button" className="text-link" onClick={onClose}>
            关闭
          </button>
        </div>
        <p className="muted" style={{ fontSize: 11, marginBottom: 8 }}>
          {checkinLabel()}
        </p>
        {presetTaskTitle && (
          <p className="group-checkin-task-hint" style={{ fontSize: 12, padding: '6px 8px' }}>
            完成任务：{presetTaskTitle}
          </p>
        )}

        {loading ? (
          <p className="muted" style={{ fontSize: 13 }}>加载群列表…</p>
        ) : groups.length === 0 ? (
          <div>
            <p className="muted" style={{ fontSize: 13 }}>你还没有加入共读群。</p>
            <a href="/discover" className="font-pill" style={{ marginTop: 8, display: 'inline-block', fontSize: 12 }}>
              去发现创建或加入
            </a>
          </div>
        ) : submitted ? (
          <p className="muted" style={{ fontSize: 13 }}>已发送打卡 ✓</p>
        ) : (
          <>
            <select
              id="group-pick"
              className="search-input"
              style={{ fontSize: 13, padding: '8px 10px' }}
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
              <div className="group-composer-label">快捷感想</div>
              <div className="chip-swipe group-chip-swipe">
                {GROUP_CHECKIN_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className={`group-chip chip-swipe-item${body === chip ? ' selected' : ''}`}
                    disabled={!gid || busy}
                    onClick={() => {
                      setBody(chip);
                      void submit(chip);
                    }}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="btn"
              style={{ width: '100%', marginTop: 8, fontSize: 14, padding: '10px 12px' }}
              disabled={!gid || busy}
              onClick={() => submit()}
            >
              {busy ? '发送中…' : presetTaskId ? '完成并分享' : '发送打卡'}
            </button>
          </>
        )}
        {err && <p className="group-composer-err" role="alert">{err}</p>}
      </div>
    </div>
  );
}
