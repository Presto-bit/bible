import type { ThinkingPhase } from '@/components/assistant/ThinkingLine';

export type ThinkingVariant = 'default' | 'halfsheet';

export function buildThinkingMessages(
  phase: ThinkingPhase,
  opts: {
    citeCount?: number;
    currentSectionTitle?: string;
    variant?: ThinkingVariant;
  } = {},
): string[] {
  const { citeCount = 0, currentSectionTitle, variant = 'default' } = opts;
  const half = variant === 'halfsheet';

  switch (phase) {
    case 'understanding':
      if (half) {
        return ['正在阅读这节经文…', '正在理解你的问题…', '正在准备释经检索…'];
      }
      return ['正在理解你的问题…', '正在结合锚定经节…', '正在准备释经检索…'];
    case 'refs':
      if (citeCount > 0) {
        return [
          '正在检索释经资料…',
          `已找到 ${citeCount} 条相关资料…`,
          '正在筛选与经节最相关的注释…',
        ];
      }
      return ['正在检索释经资料…', '资料库暂无直接对应注释…', '正在组织回答…'];
    case 'writing': {
      const base = half
        ? ['正在整理解读…', '正在组织回答…', '正在整理结构与脚注…']
        : ['正在组织回答…', '正在整理结构与脚注…', '正在核对引用格式…'];
      if (currentSectionTitle?.trim()) {
        return [`正在写「${currentSectionTitle.trim()}」…`, ...base];
      }
      return base;
    }
  }
}
