/** 小爱回答正文解析：追问剥离与去重 */

/** 「相关追问」须单独成行，避免正文中含该词时被误截断。 */
export const FOLLOWUP_SECTION_RE = /\n[ \t]*(?:【相关追问】|\[相关追问\]|相关追问\s*[:：])/;

export function stripFollowups(text: string): string {
  const idx = text.search(FOLLOWUP_SECTION_RE);
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
  const m = text.match(FOLLOWUP_SECTION_RE);
  if (!m || m.index == null) return [];
  const tail = text.slice(m.index);
  const lines = tail.split('\n').slice(1);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of lines) {
    const m = raw.match(/^\s*(?:[-*•]|\d+[.)、]|①|②|③|④|⑤)\s*(.+?)\s*$/);
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

export function bodyText(text: string): string {
  return stripFollowups(text);
}

/**
 * 句末软换行，便于阅读。
 * 不拆：编号 `1.`、括号内句末、闭合标点前（避免 `。` 后把 `）` 甩到下一行）。
 * 不对英文 `.!?` 断行（否则 `1. 要点` 会变成 `1.` / `要点` 两行）。
 */
export function softBreakSentences(text: string): string {
  let depth = 0;
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (ch === '（' || ch === '(') depth += 1;
    if (ch === '）' || ch === ')') depth = Math.max(0, depth - 1);
    out += ch;
    if (depth > 0) continue;
    if (ch !== '。' && ch !== '；' && ch !== '！' && ch !== '？') continue;
    const next = text[i + 1];
    if (!next || next === '\n') continue;
    // 句号紧贴闭合标点时不断行：`。）` `。」`
    if ('）」』》】"\'”’'.includes(next)) continue;
    out += '\n';
  }
  return out;
}

/** 合并被误拆到单独一行的闭合括号 */
export function joinOrphanClosers(text: string): string {
  return text
    .replace(/\n+[ \t]*([）\)」』》】]+)/g, '$1')
    .replace(/([（(【「『《])\n+/g, '$1');
}

export interface ParsedAnswer {
  body: string;
  followups: string[];
}

export function parseAnswer(text: string, serverFollowups?: string[]): ParsedAnswer {
  const body = stripFollowups(text);
  const followups =
    serverFollowups && serverFollowups.length > 0 ? serverFollowups : followupsOf(text);
  return { body, followups };
}

/** 流式未完成时，隐藏半截【标签行 */
export function streamingSafeBody(text: string): string {
  const t = stripFollowups(text);
  const lines = t.split('\n');
  const last = lines[lines.length - 1] ?? '';
  if (/^【[^】]*$/.test(last.trim()) || (last.includes('【') && !last.includes('】'))) {
    return lines.slice(0, -1).join('\n').trimEnd();
  }
  return t;
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
