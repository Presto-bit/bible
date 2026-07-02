/** 发现页 / 分享卡 → 小爱预填（问题走 sid 暂存，不暴露在 URL） */

const SEED_PREFIX = 'presto_ai_seed:';
const SEED_TTL_MS = 30 * 60 * 1000;

export interface AssistantPrefill {
  ref: string;
  question: string;
  autoSend?: boolean;
  scene?: string;
  seedMessages?: { role: 'user' | 'assistant'; text: string }[];
}

export function explainVerseQuestion(ref: string, excerpt?: string): string {
  const snippet = (excerpt || ref).replace(/\s+/g, ' ').trim().slice(0, 24);
  return `请解释：${snippet}${snippet.length >= 24 ? '…' : ''}`;
}

function genSid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function pruneOldSeeds() {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  for (let i = localStorage.length - 1; i >= 0; i -= 1) {
    const key = localStorage.key(i);
    if (!key?.startsWith(SEED_PREFIX)) continue;
    try {
      const row = JSON.parse(localStorage.getItem(key) || '') as { ts?: number };
      if (!row.ts || now - row.ts > SEED_TTL_MS) localStorage.removeItem(key);
    } catch {
      localStorage.removeItem(key);
    }
  }
}

/** 写入预填内容，返回 sid（仅存本地，不进 URL 明文） */
export function storeAssistantPrefill(payload: AssistantPrefill): string {
  const sid = genSid();
  if (typeof window === 'undefined') return sid;
  pruneOldSeeds();
  localStorage.setItem(
    SEED_PREFIX + sid,
    JSON.stringify({ ...payload, ts: Date.now() }),
  );
  return sid;
}

/** 读取并删除一次性 seed */
export function consumeAssistantPrefill(sid: string): AssistantPrefill | null {
  if (typeof window === 'undefined' || !sid) return null;
  const raw = localStorage.getItem(SEED_PREFIX + sid);
  localStorage.removeItem(SEED_PREFIX + sid);
  if (!raw) return null;
  try {
    const row = JSON.parse(raw) as AssistantPrefill & { ts?: number };
    if (row.ts && Date.now() - row.ts > SEED_TTL_MS) return null;
    return { ref: row.ref, question: row.question, autoSend: row.autoSend, scene: row.scene, seedMessages: row.seedMessages };
  } catch {
    return null;
  }
}

/**
 * 生成小爱页链接：URL 仅含 ref + sid（+ auto_send），问题正文在 localStorage。
 * SSR 首屏无 window 时仅带 ref，进入页后按 ref 生成默认问题。
 */
export function assistantHref(
  ref: string,
  opts?: {
    excerpt?: string;
    question?: string;
    autoSend?: boolean;
    scene?: string;
    seedMessages?: { role: 'user' | 'assistant'; text: string }[];
  },
): string {
  const q = opts?.question ?? explainVerseQuestion(ref, opts?.excerpt);
  const params = new URLSearchParams();
  params.set('ref', ref);
  if (typeof window !== 'undefined') {
    const sid = storeAssistantPrefill({
      ref,
      question: q,
      autoSend: opts?.autoSend,
      scene: opts?.scene,
      seedMessages: opts?.seedMessages,
    });
    params.set('sid', sid);
    if (opts?.autoSend) params.set('auto_send', '1');
  }
  return `/assistant?${params.toString()}`;
}

/** 编程式跳转（搜索页等） */
export function navigateToAssistant(
  ref: string,
  opts?: {
    excerpt?: string;
    question?: string;
    autoSend?: boolean;
    scene?: string;
    seedMessages?: { role: 'user' | 'assistant'; text: string }[];
  },
) {
  if (typeof window === 'undefined') return;
  window.location.href = assistantHref(ref, opts);
}
