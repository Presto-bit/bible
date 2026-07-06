'use client';

export type ThinkingPhase = 'understanding' | 'refs' | 'writing';

type Props = {
  phase: ThinkingPhase;
  citeCount?: number;
  slow?: boolean;
};

const PHASE_LABEL: Record<ThinkingPhase, string> = {
  understanding: '正在理解你的问题…',
  refs: '已找到经文参考，正在组织回答…',
  writing: '正在组织回答…',
};

/** 小爱等待首包输出时的占位（骨架 + 分阶段文案） */
export function AssistantThinkingState({ phase, citeCount = 0, slow = false }: Props) {
  const label =
    phase === 'refs' && citeCount > 0
      ? `已找到 ${citeCount} 处经文参考，正在组织回答…`
      : PHASE_LABEL[phase];

  return (
    <div className="assistant-thinking" role="status" aria-live="polite">
      <div className="assistant-thinking-skeleton" aria-hidden>
        <span className="assistant-thinking-line" />
        <span className="assistant-thinking-line assistant-thinking-line-short" />
        <span className="assistant-thinking-line assistant-thinking-line-mid" />
      </div>
      <p className="assistant-thinking-label muted">{label}</p>
      {slow && (
        <p className="assistant-thinking-slow muted">网络较慢，可稍候或点「停止」后重试</p>
      )}
    </div>
  );
}
