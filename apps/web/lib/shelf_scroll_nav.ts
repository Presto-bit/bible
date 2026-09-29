/** 书架 flow 切节滚动语义：左右滑到开头 / 目录续读可中部。 */

export type ShelfScrollIntent = 'start' | 'end' | 'resume';

export type ShelfScrollAnchor = { paragraphIndex: number };

export type ShelfFlowScrollApply = {
  scrollOffset: number;
  scrollAnchor: ShelfScrollAnchor | undefined;
  scrollToEnd: boolean;
};

/**
 * 解析传给 prose/lesson 的初始滚动。
 * - section 未对齐（旧 DOM + 新 sectionId）时绝不套用中部 anchor
 * - start / end 强制开头或末尾
 */
export function resolveShelfFlowScrollApply(input: {
  intent: ShelfScrollIntent;
  sectionMatches: boolean;
  flowRatio: number;
  savedAnchor?: ShelfScrollAnchor | null;
  flowAnchor?: ShelfScrollAnchor | null;
}): ShelfFlowScrollApply {
  if (!input.sectionMatches) {
    return {
      scrollOffset: input.intent === 'end' ? 1 : 0,
      scrollAnchor: undefined,
      scrollToEnd: input.intent === 'end',
    };
  }
  if (input.intent === 'start') {
    return { scrollOffset: 0, scrollAnchor: undefined, scrollToEnd: false };
  }
  if (input.intent === 'end') {
    return { scrollOffset: 1, scrollAnchor: undefined, scrollToEnd: true };
  }
  return {
    scrollOffset: input.flowRatio,
    scrollAnchor: input.savedAnchor ?? input.flowAnchor ?? undefined,
    scrollToEnd: false,
  };
}

/** 进度/锚点回写：未对齐或仍在 start/end 钉住阶段时丢弃，避免污染新节。 */
export function shouldAcceptShelfFlowScrollReport(input: {
  intent: ShelfScrollIntent;
  sectionMatches: boolean;
  navEpoch: number;
  reportEpoch: number;
}): boolean {
  if (input.navEpoch !== input.reportEpoch) return false;
  if (!input.sectionMatches) return false;
  if (input.intent === 'start' || input.intent === 'end') return false;
  return true;
}
