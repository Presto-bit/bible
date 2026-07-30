'use client';

import { useEffect, useState } from 'react';

export type ReportReason = 'spam' | 'abuse' | 'heresy' | 'illegal' | 'other';

const REASONS: { id: ReportReason; label: string }[] = [
  { id: 'spam', label: '广告 / 骚扰' },
  { id: 'abuse', label: '辱骂 / 不当内容' },
  { id: 'heresy', label: '异端或邪教传教' },
  { id: 'illegal', label: '违法违规' },
  { id: 'other', label: '其他' },
];

type Props = {
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (reason: ReportReason, detail?: string) => void | Promise<void>;
};

export function ReportSheet({ open, busy, onClose, onSubmit }: Props) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState('');

  useEffect(() => {
    if (!open) {
      setReason(null);
      setDetail('');
    }
  }, [open]);

  if (!open) return null;

  const reasonLabel = REASONS.find((r) => r.id === reason)?.label;

  return (
    <div className="report-sheet-root" role="dialog" aria-modal="true" aria-label="举报">
      <button type="button" className="report-sheet-backdrop" aria-label="关闭" onClick={onClose} />
      <div className="report-sheet-panel">
        <strong>举报内容</strong>
        <p className="muted" style={{ margin: '6px 0 12px', fontSize: 13 }}>
          请选择原因并确认提交。异端渗透将进入优先审核队列。
        </p>
        <div className="report-sheet-reasons">
          {REASONS.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`btn btn-ghost${reason === r.id ? ' is-active' : ''}`}
              disabled={busy}
              style={{
                width: '100%',
                justifyContent: 'flex-start',
                outline: reason === r.id ? '2px solid var(--accent, #2f6fed)' : undefined,
              }}
              onClick={() => setReason(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <textarea
          className="input im-report-note"
          value={detail}
          disabled={busy}
          placeholder="补充说明（可选）"
          maxLength={500}
          onChange={(e) => setDetail(e.target.value)}
        />
        <button
          type="button"
          className="btn im-report-confirm"
          disabled={busy || !reason}
          onClick={() => {
            if (!reason) return;
            if (!window.confirm(`确认举报「${reasonLabel}」？`)) return;
            void onSubmit(reason, detail.trim() || undefined);
          }}
        >
          {busy ? '提交中…' : '确认举报'}
        </button>
        <button type="button" className="text-link" style={{ marginTop: 10 }} onClick={onClose} disabled={busy}>
          取消
        </button>
      </div>
    </div>
  );
}
