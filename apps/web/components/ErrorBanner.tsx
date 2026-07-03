'use client';

import { friendlyError } from '@/lib/friendly_error';

type Props = {
  message: string;
  detail?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
};

export default function ErrorBanner({ message, detail, onRetry, onDismiss }: Props) {
  return (
    <div className="error-banner" role="alert">
      <div>
        <strong>{message}</strong>
        {detail ? <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>{detail}</p> : null}
      </div>
      <div className="error-banner-actions">
        {onRetry ? (
          <button type="button" className="font-pill" onClick={onRetry}>重试</button>
        ) : null}
        {onDismiss ? (
          <button type="button" className="text-link" onClick={onDismiss}>关闭</button>
        ) : null}
      </div>
    </div>
  );
}

export function errorMessage(err: unknown, fallback?: string) {
  return friendlyError(err, fallback);
}
