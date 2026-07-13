'use client';

import { SheetCloseButton } from '@/components/PageBackBar';
import { useState } from 'react';
import { GROUP_CHECKIN_CHIPS, GROUP_CHECKIN_BODY_MAX, normalizeCheckinBody } from '@/lib/group_checkin';
import type { GroupCompletionRule } from '@/lib/group_task_templates';

type Props = {
  title: string;
  refLabel?: string | null;
  completionRule?: GroupCompletionRule | string;
  onSubmit: (body: string) => Promise<void>;
  onClose: () => void;
};

export function GroupTaskCompleteSheet({
  title,
  refLabel,
  completionRule = 'checkin_text',
  onSubmit,
  onClose,
}: Props) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const rule = (completionRule || 'checkin_text') as GroupCompletionRule;
  const requireText = rule === 'checkin_text';
  const lightConfirm = rule === 'tap' || rule === 'read_done';

  const onBodyInput = (value: string) => {
    setBody(value.slice(0, GROUP_CHECKIN_BODY_MAX));
  };

  const submit = async () => {
    if (requireText && !body.trim()) {
      setErr('请写下感想后再完成');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await onSubmit(normalizeCheckinBody(body));
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const cta = lightConfirm ? '确认完成' : '分享到群';

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet card group-checkin-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="half-sheet-grab" aria-hidden />
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong>{lightConfirm ? '完成任务' : '完成并分享'}</strong>
          <SheetCloseButton onClick={onClose} />
        </div>
        <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
          {lightConfirm
            ? `确认完成「${title}」`
            : `将显示为「已完成任务·${title}」`}
        </p>
        {refLabel && <p className="muted" style={{ fontSize: 12 }}>关联：{refLabel}</p>}
        {!lightConfirm && (
          <>
            <div className="group-chip-row" style={{ marginTop: 10 }}>
              {GROUP_CHECKIN_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className={`group-chip${body === chip ? ' selected' : ''}`}
                  onClick={() => onBodyInput(body === chip ? '' : chip)}
                >
                  {chip}
                </button>
              ))}
            </div>
            <textarea
              className="group-composer-text search-input compose-textarea"
              rows={3}
              placeholder={requireText ? '写下感想（必填）' : '写下今天的感受（可选）'}
              value={body}
              maxLength={GROUP_CHECKIN_BODY_MAX}
              onChange={(e) => onBodyInput(e.target.value)}
            />
            <p className="muted group-composer-char-count" style={{ textAlign: 'right', marginTop: 4 }}>
              {body.length}/{GROUP_CHECKIN_BODY_MAX}
            </p>
          </>
        )}
        <button type="button" className="btn" style={{ width: '100%' }} disabled={busy} onClick={submit}>
          {busy ? '提交中…' : cta}
        </button>
        {err && <p className="group-composer-err" role="alert">{err}</p>}
      </div>
    </div>
  );
}
