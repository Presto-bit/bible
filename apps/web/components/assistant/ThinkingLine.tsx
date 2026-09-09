'use client';

import { useEffect, useMemo, useState } from 'react';
import { buildThinkingMessages } from '@/lib/thinking_ticker';

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
  const messages = useMemo(
    () =>
      buildThinkingMessages(phase, {
        citeCount,
        currentSectionTitle,
        variant,
      }),
    [phase, citeCount, currentSectionTitle, variant],
  );
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [messages]);

  useEffect(() => {
    if (messages.length <= 1) return undefined;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % messages.length);
    }, 2500);
    return () => window.clearInterval(id);
  }, [messages]);

  const label = messages[index] ?? messages[0] ?? '正在组织回答…';

  return (
    <div
      className={`assistant-thinking-line-wrap${variant === 'halfsheet' ? ' halfsheet-thinking' : ''}`}
      role="status"
      aria-live="polite"
    >
      <p key={label} className="assistant-thinking-line-text muted assistant-thinking-tick">
        {label}
      </p>
      {slow ? (
        <p className="assistant-thinking-slow muted">网络较慢，可稍候或点「停止」后重试</p>
      ) : null}
    </div>
  );
}
