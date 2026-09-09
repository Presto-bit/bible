/** 端侧经包 FAQ：弱网/离线秒答默认「请解读」问句。 */

import type { AssistantScene } from '@/lib/assistant_scenes';
import { withBasePath } from '@/lib/basePath';

type VerseFaqBundle = {
  schema?: string;
  verses?: Record<string, { answer?: string }>;
};

let bundlePromise: Promise<VerseFaqBundle | null> | null = null;

async function loadBundle(): Promise<VerseFaqBundle | null> {
  if (typeof window === 'undefined') return null;
  if (!bundlePromise) {
    bundlePromise = fetch(withBasePath('/content/verse_faq/explain.json'), {
      cache: 'force-cache',
    })
      .then((res) => (res.ok ? (res.json() as Promise<VerseFaqBundle>) : null))
      .catch(() => null);
  }
  return bundlePromise;
}

export function normalizeVerseFaqRef(ref: string): string {
  return ref.trim().toUpperCase();
}

/** FAB 零选区、verse_quick 默认解读问句。 */
export function isDefaultHalfSheetExplain(
  question: string,
  explicitSelection: boolean,
  scene: AssistantScene,
): boolean {
  if (explicitSelection) return false;
  if (scene !== 'verse_quick') return false;
  const q = question.trim();
  return /^请解读：/.test(q) && !q.includes('「');
}

export async function readVerseFaqExplain(ref: string): Promise<string | null> {
  const bundle = await loadBundle();
  const entry = bundle?.verses?.[normalizeVerseFaqRef(ref)];
  const answer = entry?.answer?.trim();
  return answer || null;
}
