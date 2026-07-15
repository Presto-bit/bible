'use client';

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
  onSubmit: (reason: ReportReason) => void | Promise<void>;
};

export function ReportSheet({ open, busy, onClose, onSubmit }: Props) {
  if (!open) return null;
  return (
    <div className="report-sheet-root" role="dialog" aria-modal="true" aria-label="举报">
      <button type="button" className="report-sheet-backdrop" aria-label="关闭" onClick={onClose} />
      <div className="report-sheet-panel">
        <strong>举报内容</strong>
        <p className="muted" style={{ margin: '6px 0 12px', fontSize: 13 }}>
          请选择原因。异端渗透将进入优先审核队列。
        </p>
        <div className="report-sheet-reasons">
          {REASONS.map((r) => (
            <button
              key={r.id}
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              style={{ width: '100%', justifyContent: 'flex-start' }}
              onClick={() => void onSubmit(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button type="button" className="text-link" style={{ marginTop: 10 }} onClick={onClose} disabled={busy}>
          取消
        </button>
      </div>
    </div>
  );
}
