/** 发现页 / 分享卡 → 小爱预填（PRODUCT §5.4.2） */

export function explainVerseQuestion(ref: string, excerpt?: string): string {
  const snippet = (excerpt || ref).replace(/\s+/g, ' ').trim().slice(0, 24);
  return `请解释：${snippet}${snippet.length >= 24 ? '…' : ''}`;
}

export function assistantHref(
  ref: string,
  opts?: { excerpt?: string; autoSend?: boolean },
): string {
  const params = new URLSearchParams();
  params.set('ref', ref);
  const q = explainVerseQuestion(ref, opts?.excerpt);
  if (opts?.autoSend !== false) {
    params.set('q', q);
  }
  return `/assistant?${params.toString()}`;
}
