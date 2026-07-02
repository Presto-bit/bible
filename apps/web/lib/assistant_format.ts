/** 小爱回答正文解析：追问剥离与去重 */

export function stripFollowups(text: string): string {
  const idx = text.search(/\n?\s*[【\[]?\s*相关追问\s*[】\]]?[:：]?/);
  return idx >= 0 ? text.slice(0, idx).trim() : text.trim();
}

/** 归一化问题文本，用于去重比对 */
export function normalizeQuestion(q: string): string {
  return q
    .replace(/\s+/g, '')
    .replace(/[？?。！!，,、；;：:""''「」【】]/g, '')
    .toLowerCase();
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
    const key = normalizeQuestion(q);
    if (!q || seen.has(key)) continue;
    seen.add(key);
    out.push(q);
    if (out.length >= 3) break;
  }
  return out;
}

/** 过滤已与用户问过、或历史追问出现过的建议 */
export function followupsForMessage(
  text: string,
  opts: { priorUserQuestions?: string[]; priorFollowups?: string[] },
): string[] {
  const blocked = new Set<string>();
  for (const q of opts.priorUserQuestions ?? []) {
    const key = normalizeQuestion(q);
    if (key) blocked.add(key);
  }
  for (const q of opts.priorFollowups ?? []) {
    const key = normalizeQuestion(q);
    if (key) blocked.add(key);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of followupsOf(text)) {
    const key = normalizeQuestion(q);
    if (!key || blocked.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}
