'use client';

import { useMemo } from 'react';
import { buildThinkingLabel } from '@/lib/thinking_ticker';

export type ThinkingPhase = 'understanding' | 'refs' | 'writing';

type Props = {
  phase: ThinkingPhase;
  citeCount?: number;
  slow?: boolean;
  variant?: 'default' | 'halfsheet';
  currentSectionTitle?: string;
};

/** 等待首包：单行灰色过程提示，出正文即消失。 */
export function ThinkingLine({
  phase,
  citeCount = 0,
  slow = false,
  variant = 'default',
  currentSectionTitle,
}: Props) {
  const label = useMemo(
    () =>
      buildThinkingLabel(phase, {
        citeCount,
        currentSectionTitle,
        variant,
      }),
    [phase, citeCount, currentSectionTitle, variant],
  );

  return (
    <div
      className={`assistant-thinking-line-wrap${variant === 'halfsheet' ? ' halfsheet-thinking' : ''}`}
      role="status"
      aria-live="polite"
    >
      <p className="assistant-thinking-line-text muted">{label}</p>
      {slow ? (
        <p className="assistant-thinking-slow muted">网络较慢，可稍候或点「停止」后重试</p>
      ) : null}
    </div>
  );
}
