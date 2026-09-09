import type { ThinkingPhase } from '@/components/assistant/ThinkingLine';

export type ThinkingVariant = 'default' | 'halfsheet';

/** 思考行单行文案：按阶段展示，不循环轮播。 */
export function buildThinkingLabel(
  phase: ThinkingPhase,
  opts: {
    citeCount?: number;
    currentSectionTitle?: string;
    variant?: ThinkingVariant;
  } = {},
): string {
  const { citeCount = 0, currentSectionTitle, variant = 'default' } = opts;
  const half = variant === 'halfsheet';

  switch (phase) {
    case 'understanding':
      return half ? '正在阅读这节经文…' : '正在理解你的问题…';
    case 'refs':
      if (citeCount > 0) {
        return `已找到 ${citeCount} 条释经资料，正在组织回答…`;
      }
      return '正在检索释经资料…';
    case 'writing':
      if (currentSectionTitle?.trim()) {
        return `正在写「${currentSectionTitle.trim()}」…`;
      }
      return half ? '正在整理解读…' : '正在组织回答…';
  }
}
