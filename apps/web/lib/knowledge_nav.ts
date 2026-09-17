/** 探索专题：退出手稿回列表时跳过重播入场动画；卡片放大过渡原点 */

const SOFT_RETURN_KEY = 'beiai_knowledge_soft_return';
const EXPAND_ORIGIN_KEY = 'beiai_knowledge_expand_origin';

export type KnowledgeExpandOrigin = {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
};

export function markKnowledgeSoftReturn(): void {
  try {
    sessionStorage.setItem(SOFT_RETURN_KEY, '1');
  } catch {
    /* private mode */
  }
}

export function consumeKnowledgeSoftReturn(): boolean {
  try {
    if (sessionStorage.getItem(SOFT_RETURN_KEY) === '1') {
      sessionStorage.removeItem(SOFT_RETURN_KEY);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** 点击卡片时记下屏幕矩形，供手稿页做小红书式放大 */
export function markKnowledgeExpandOrigin(el: HTMLElement | null): void {
  if (!el || typeof window === 'undefined') return;
  try {
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;
    const payload: KnowledgeExpandOrigin = {
      x: r.left,
      y: r.top,
      w: r.width,
      h: r.height,
      radius: 16,
    };
    sessionStorage.setItem(EXPAND_ORIGIN_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function peekKnowledgeExpandOrigin(): KnowledgeExpandOrigin | null {
  try {
    const raw = sessionStorage.getItem(EXPAND_ORIGIN_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as KnowledgeExpandOrigin;
    if (
      typeof o?.x !== 'number' ||
      typeof o?.y !== 'number' ||
      typeof o?.w !== 'number' ||
      typeof o?.h !== 'number'
    ) {
      return null;
    }
    return o;
  } catch {
    return null;
  }
}

export function clearKnowledgeExpandOrigin(): void {
  try {
    sessionStorage.removeItem(EXPAND_ORIGIN_KEY);
  } catch {
    /* ignore */
  }
}
