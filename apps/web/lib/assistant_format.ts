/** 小爱回答正文解析：追问剥离与去重 */

export function stripFollowups(text: string): string {
  const idx = text.search(/\n?\s*[【\[]?\s*相关追问\s*[】\]]?[:：]?/);
  return idx >= 0 ? text.slice(0, idx).trim() : text.trim();
}

export function followupsOf(text: string): string[] {
  const idx = text.search(/[【\[]?\s*相关追问\s*[】\]]?[:：]?/);
  if (idx < 0) return [];
  const tail = text.slice(idx);
  const lines = tail.split('\n').slice(1);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of lines) {
    const m = raw.match(/^\s*(?:[-*•]|\d+[.)、])\s*(.+?)\s*$/);
    if (!m?.[1]) continue;
    const q = m[1].replace(/^["“]|["”]$/g, '').trim();
    if (!q || seen.has(q)) continue;
    seen.add(q);
    out.push(q);
    if (out.length >= 3) break;
  }
  return out;
}
