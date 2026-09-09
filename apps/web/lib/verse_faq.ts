/** 端侧经包 FAQ：弱网/离线秒答默认「请解读/请解释」问句。 */

import type { AssistantScene } from '@/lib/assistant_scenes';
import { withBasePath } from '@/lib/basePath';

/** 与 `data/verse_faq/explain.json` 的 schema 字段对齐，发版时递增。 */
export const VERSE_FAQ_BUNDLE_VERSION = 'verse_faq_explain@1';

type VerseFaqBundle = {
  schema?: string;
  verses?: Record<string, { answer?: string }>;
};

const DEEP_Q =
  /分别|详细|深入|全面|完整|整段|脉络|逐节|每一节|背景.*应用|应用.*背景|从背景|历史背景|上下文|结构/;

let bundlePromise: Promise<VerseFaqBundle | null> | null = null;
let cachedBundle: VerseFaqBundle | null = null;

/** 追问是否要展开背景/结构（对齐服务端 `wants_expanded_answer`）。 */
export function wantsExpandedAnswer(question: string): boolean {
  const q = question.trim();
  return Boolean(q && DEEP_Q.test(q));
}

async function loadBundle(): Promise<VerseFaqBundle | null> {
  if (typeof window === 'undefined') return null;
  if (cachedBundle?.schema === VERSE_FAQ_BUNDLE_VERSION) return cachedBundle;
  if (!bundlePromise) {
    bundlePromise = fetch(
      withBasePath(`/content/verse_faq/explain.json?v=${VERSE_FAQ_BUNDLE_VERSION}`),
      { cache: 'force-cache' },
    )
      .then((res) => (res.ok ? (res.json() as Promise<VerseFaqBundle>) : null))
      .then((b) => {
        if (b?.schema === VERSE_FAQ_BUNDLE_VERSION) cachedBundle = b;
        return b;
      })
      .catch(() => null);
  }
  return bundlePromise;
}

/** 进入读经/小爱时预拉经包，减少半屏首开等待。 */
export function preloadVerseFaq(): void {
  void loadBundle();
}

export function normalizeVerseFaqRef(ref: string): string {
  return ref.trim().toUpperCase();
}

/** 默认「请解读/请解释：…」问句（无选区 snippet）。 */
export function isDefaultExplainQuestion(question: string): boolean {
  const q = question.trim();
  if (q.includes('「')) return false;
  return /^请(?:解读|解释)[：:]/.test(q);
}

/** FAB 零选区、verse_quick 默认解读问句。 */
export function isDefaultHalfSheetExplain(
  question: string,
  explicitSelection: boolean,
  scene: AssistantScene,
): boolean {
  if (explicitSelection) return false;
  if (scene !== 'verse_quick' && scene !== 'verse_full') return false;
  return isDefaultExplainQuestion(question);
}

/** Tab 首问默认解读（有 anchor、无 history）。 */
export function isDefaultTabExplain(opts: {
  question: string;
  historyLength: number;
  scene: AssistantScene;
  hasRef: boolean;
}): boolean {
  if (!opts.hasRef || opts.historyLength > 0) return false;
  if (
    opts.scene !== 'verse_quick' &&
    opts.scene !== 'chat_explain' &&
    opts.scene !== 'verse_full'
  ) {
    return false;
  }
  return isDefaultExplainQuestion(opts.question);
}

export async function readVerseFaqExplain(ref: string): Promise<string | null> {
  const bundle = await loadBundle();
  const entry = bundle?.verses?.[normalizeVerseFaqRef(ref)];
  const answer = entry?.answer?.trim();
  return answer || null;
}

export function readVerseFaqExplainSync(ref: string): string | null {
  const entry = cachedBundle?.verses?.[normalizeVerseFaqRef(ref)];
  const answer = entry?.answer?.trim();
  return answer || null;
}
