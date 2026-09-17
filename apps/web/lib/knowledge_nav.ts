/** 探索专题：软回列表 + 壳层小红书式封面放大/缩回 */

const SOFT_RETURN_KEY = 'beiai_knowledge_soft_return';
const EXPAND_SESSION_KEY = 'beiai_knowledge_expand_session';
/** @deprecated 旧 key，读取时兼容 */
const EXPAND_ORIGIN_KEY = 'beiai_knowledge_expand_origin';

export type KnowledgeExpandOrigin = {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
  cover?: string;
};

export type KnowledgeExpandPhase = 'idle' | 'enter' | 'hold' | 'leave';

export type KnowledgeExpandSession = {
  phase: KnowledgeExpandPhase;
  origin: KnowledgeExpandOrigin;
  cover: string;
  href?: string;
  topicId?: string;
};

type Listener = () => void;

let session: KnowledgeExpandSession | null = null;
/** reveal 后仍保留 origin，供 leave 缩回；phase 可为 idle 但 leaveOrigin 仍在 */
let leaveOrigin: KnowledgeExpandOrigin | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

function persistSession(s: KnowledgeExpandSession | null): void {
  try {
    if (!s) {
      sessionStorage.removeItem(EXPAND_SESSION_KEY);
      sessionStorage.removeItem(EXPAND_ORIGIN_KEY);
      return;
    }
    sessionStorage.setItem(
      EXPAND_SESSION_KEY,
      JSON.stringify({
        origin: s.origin,
        cover: s.cover,
        href: s.href,
        topicId: s.topicId,
      }),
    );
  } catch {
    /* private mode */
  }
}

function parseOrigin(o: unknown): KnowledgeExpandOrigin | null {
  if (!o || typeof o !== 'object') return null;
  const r = o as KnowledgeExpandOrigin;
  if (
    typeof r.x !== 'number' ||
    typeof r.y !== 'number' ||
    typeof r.w !== 'number' ||
    typeof r.h !== 'number'
  ) {
    return null;
  }
  return {
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
    radius: typeof r.radius === 'number' ? r.radius : 16,
    cover: typeof r.cover === 'string' ? r.cover : undefined,
  };
}

function readPersistedOrigin(): KnowledgeExpandOrigin | null {
  try {
    const raw = sessionStorage.getItem(EXPAND_SESSION_KEY);
    if (raw) {
      const data = JSON.parse(raw) as {
        origin?: unknown;
        cover?: string;
      };
      const origin = parseOrigin(data.origin);
      if (origin) {
        if (data.cover && !origin.cover) origin.cover = data.cover;
        return origin;
      }
    }
    const legacy = sessionStorage.getItem(EXPAND_ORIGIN_KEY);
    if (legacy) return parseOrigin(JSON.parse(legacy));
  } catch {
    /* ignore */
  }
  return null;
}

export function subscribeKnowledgeExpand(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getKnowledgeExpandSession(): KnowledgeExpandSession | null {
  return session;
}

export function getKnowledgeExpandLeaveOrigin(): KnowledgeExpandOrigin | null {
  return leaveOrigin || session?.origin || null;
}

export function isKnowledgeExpandActive(): boolean {
  const p = session?.phase;
  return p === 'enter' || p === 'hold' || p === 'leave';
}

function rectFromEl(el: HTMLElement): KnowledgeExpandOrigin | null {
  const r = el.getBoundingClientRect();
  if (r.width < 8 || r.height < 8) return null;
  return {
    x: r.left,
    y: r.top,
    w: r.width,
    h: r.height,
    radius: 16,
  };
}

export type StartKnowledgeExpandArgs = {
  el: HTMLElement | null;
  cover?: string;
  href?: string;
  topicId?: string;
};

/** 点击卡片：只记缩回原点，进场不再播封面放大（直接出最终手稿态） */
export function startKnowledgeExpand(args: StartKnowledgeExpandArgs): boolean {
  if (typeof window === 'undefined') return false;
  const origin = args.el ? rectFromEl(args.el) : null;
  if (!origin) return false;
  const cover = (args.cover || '').trim();
  origin.cover = cover || undefined;
  leaveOrigin = { ...origin };
  // 不进入 enter/hold：进场由 Viewer 直接展示最终态；Host 仅负责 leave 缩回
  session = null;
  persistSession({
    phase: 'idle',
    origin,
    cover,
    href: args.href,
    topicId: args.topicId,
  });
  emit();
  return true;
}

/** 兼容旧调用：只记原点（同页封面打开也可走 start） */
export function markKnowledgeExpandOrigin(
  el: HTMLElement | null,
  cover?: string,
): void {
  startKnowledgeExpand({ el, cover });
}

/** 进场 FLIP 结束 → 全屏封面垫住加载 */
export function holdKnowledgeExpand(): void {
  if (!session || session.phase !== 'enter') return;
  session = { ...session, phase: 'hold' };
  emit();
}

/**
 * 手稿 Viewer 已可展示 → Host 淡出封面层。
 * phase=idle 仅作淡出信号；淡出结束后 Host 调 dismissKnowledgeExpandLayer。
 * leaveOrigin 一直保留到 finishKnowledgeCollapse。
 */
export function revealKnowledgeExpand(): void {
  if (!session) return;
  if (session.phase !== 'enter' && session.phase !== 'hold') return;
  session = { ...session, phase: 'idle' };
  emit();
}

/** Host：reveal 淡出结束后卸图层，保留 leaveOrigin */
export function dismissKnowledgeExpandLayer(): void {
  session = null;
  emit();
}

/** Viewer 关闭：壳层缩回卡片 */
export function beginKnowledgeCollapse(): boolean {
  const origin = leaveOrigin || session?.origin || readPersistedOrigin();
  if (!origin) return false;
  const cover = origin.cover || session?.cover || '';
  leaveOrigin = origin;
  session = {
    phase: 'leave',
    origin,
    cover,
    href: session?.href,
    topicId: session?.topicId,
  };
  emit();
  return true;
}

/** 退场动画结束，清会话 */
export function finishKnowledgeCollapse(): void {
  session = null;
  leaveOrigin = null;
  persistSession(null);
  emit();
}

export function clearKnowledgeExpandOrigin(): void {
  session = null;
  leaveOrigin = null;
  persistSession(null);
  emit();
}

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

/** Host：hydrate 冷启动时若有持久化原点（少见），不自动进场 */
export function peekKnowledgeExpandOrigin(): KnowledgeExpandOrigin | null {
  return session?.origin || leaveOrigin || readPersistedOrigin();
}

/** 进场加载占位：读持久化封面，避免黑屏空等 */
export function peekKnowledgeExpandCover(): string {
  if (session?.cover) return session.cover;
  try {
    const raw = sessionStorage.getItem(EXPAND_SESSION_KEY);
    if (raw) {
      const data = JSON.parse(raw) as { cover?: string; origin?: { cover?: string } };
      const c = (data.cover || data.origin?.cover || '').trim();
      if (c) return c;
    }
  } catch {
    /* ignore */
  }
  return (leaveOrigin?.cover || '').trim();
}
