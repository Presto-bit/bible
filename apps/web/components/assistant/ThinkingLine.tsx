'use client';

export type ThinkingPhase = 'understanding' | 'refs' | 'writing';

type Props = {
  phase: ThinkingPhase;
  citeCount?: number;
  slow?: boolean;
  variant?: 'default' | 'halfsheet';
};

const PHASE_LABEL: Record<ThinkingPhase, string> = {
  understanding: '正在理解你的问题…',
  refs: '正在检索释经资料…',
  writing: '正在组织回答…',
};

const HALFSHEET_PHASE_LABEL: Record<ThinkingPhase, string> = {
  understanding: '正在阅读这节经文…',
  refs: '正在检索释经资料…',
  writing: '正在整理解读…',
};

/** 等待首包：单行灰色过程提示，出正文即消失。 */
export function ThinkingLine({
  phase,
  citeCount = 0,
  slow = false,
  variant = 'default',
}: Props) {
  const labels = variant === 'halfsheet' ? HALFSHEET_PHASE_LABEL : PHASE_LABEL;
  let label = labels[phase];
  if (phase === 'refs') {
    label =
      citeCount > 0
        ? `已找到 ${citeCount} 条释经资料，正在组织回答…`
        : '资料库暂无直接对应注释，正在组织回答…';
  }

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
