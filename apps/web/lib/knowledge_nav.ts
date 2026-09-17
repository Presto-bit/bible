/** 探索专题：退出手稿回列表时跳过重播入场动画；卡片放大过渡原点 */

const SOFT_RETURN_KEY = 'beiai_knowledge_soft_return';
const EXPAND_ORIGIN_KEY = 'beiai_knowledge_expand_origin';

export type KnowledgeExpandOrigin = {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
  /** 卡片封面，载入期放大层用 */
  cover?: string;
};

/** 同一次导航里 Suspense → loading 可能挂两次 Boot，只让第一次播放大 */
let expandBootClaimed = false;
let expandOriginMemory: KnowledgeExpandOrigin | null = null;

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

/** 点击卡片时记下屏幕矩形 + 封面，供载入期做小红书式放大 */
export function markKnowledgeExpandOrigin(
  el: HTMLElement | null,
  cover?: string,
): void {
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
      cover: (cover || '').trim() || undefined,
    };
    expandOriginMemory = payload;
    expandBootClaimed = false;
    sessionStorage.setItem(EXPAND_ORIGIN_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

function parseExpandOrigin(raw: string): KnowledgeExpandOrigin | null {
  try {
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

export function peekKnowledgeExpandOrigin(): KnowledgeExpandOrigin | null {
  if (expandOriginMemory) return expandOriginMemory;
  try {
    const raw = sessionStorage.getItem(EXPAND_ORIGIN_KEY);
    if (!raw) return null;
    const o = parseExpandOrigin(raw);
    if (o) expandOriginMemory = o;
    return o;
  } catch {
    return null;
  }
}

/**
 * 载入期 Boot 领取放大动画（只领一次）。
 * 不清除原点，后续 Boot 仍可用封面垫场；手稿 Viewer 见 claimed 则不再放大。
 */
export function claimKnowledgeExpandForBoot(): KnowledgeExpandOrigin | null {
  const o = peekKnowledgeExpandOrigin();
  if (!o || expandBootClaimed) return null;
  expandBootClaimed = true;
  return o;
}

/** 手稿层：Boot 已播过则不再放大；同页封面打开仍可放大 */
export function peekKnowledgeExpandOriginForViewer(): KnowledgeExpandOrigin | null {
  if (expandBootClaimed) return null;
  return peekKnowledgeExpandOrigin();
}

export function clearKnowledgeExpandOrigin(): void {
  expandOriginMemory = null;
  expandBootClaimed = false;
  try {
    sessionStorage.removeItem(EXPAND_ORIGIN_KEY);
  } catch {
    /* ignore */
  }
}
