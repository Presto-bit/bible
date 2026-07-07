'use client';

type Props = {
  title: string;
  detail?: string;
  action?: { label: string; onClick: () => void };
  children?: React.ReactNode;
};

/** 非阻断式离线提示：保留页面框架，不遮挡底部 Tab */
export function OfflineInlineNotice({ title, detail, action, children }: Props) {
  return (
    <div className="offline-inline-notice" role="status">
      <div>
        <strong>{title}</strong>
        {detail ? <p className="muted">{detail}</p> : null}
      </div>
      {action ? (
        <button type="button" className="font-pill" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
      {children}
    </div>
  );
}
