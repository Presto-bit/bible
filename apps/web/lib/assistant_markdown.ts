import {
  bodyText,
  joinOrphanClosers,
  joinOrphanFootnotes,
  softBreakSentences,
  streamingSafeBody,
  stripTrailingReferences,
} from '@/lib/assistant_format';

const SECTION_LABEL_RE = /^【([^】]+)】\s*(.*)$/;

/** 系统 prompt 内部标签，不应提升为 ### 标题展示给用户。 */
function isInternalPromptLabel(label: string): boolean {
  return (
    label.includes('快懂模式')
    || label.includes('教案模式')
    || label.startsWith('标准模式')
    || label.startsWith('Markdown 规范')
  );
}
const FOLLOWUP_HEAD_RE =
  /^[ \t]*(?:###\s*相关追问|【相关追问】|\[相关追问\]|相关追问\s*[:：])\s*$/;
const CITE_LINK_RE = /^#cite-(\d{1,2})$/;
const ORDERED_CN_RE = /^(\s*)(\d+)[、.)）]\s+(.*)$/;
const CIRCLED_ORDERED_RE = /^(\s*)([①②③④⑤⑥⑦⑧⑨⑩⑪⑫])[、.)）]?\s*(.*)$/;

const CIRCLED_TO_NUM: Record<string, string> = {
  '①': '1',
  '②': '2',
  '③': '3',
  '④': '4',
  '⑤': '5',
  '⑥': '6',
  '⑦': '7',
  '⑧': '8',
  '⑨': '9',
  '⑩': '10',
  '⑪': '11',
  '⑫': '12',
};

/** 将「1、」「①」等规范为 Markdown 有序列表「1. 」。 */
function normalizeOrderedLists(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const circled = line.match(CIRCLED_ORDERED_RE);
      if (circled) {
        const num = CIRCLED_TO_NUM[circled[2]!] ?? circled[2]!;
        return `${circled[1]}${num}. ${circled[3]}`;
      }
      const cn = line.match(ORDERED_CN_RE);
      if (cn) return `${cn[1]}${cn[2]}. ${cn[3]}`;
      return line;
    })
    .join('\n');
}

/** 将中文/数字脚标转为可点击的伪链接，供 Markdown 解析后替换为按钮。 */
function linkifyCitations(text: string): string {
  return text.replace(
    /［(\d{1,2})］|【(\d{1,2})】|（(\d{1,2})）|\[(\d{1,2})\](?!\(#cite-)/g,
    (_full, a, b, c, d) => {
      const n = a ?? b ?? c ?? d;
      return `[${n}](#cite-${n})`;
    },
  );
}

/** 把小爱常用的【摘要】等标签行提升为 Markdown 三级标题。 */
function promoteSectionLabels(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || FOLLOWUP_HEAD_RE.test(trimmed)) return line;
      const m = trimmed.match(SECTION_LABEL_RE);
      if (!m) return line;
      const [, label, rest] = m;
      if (isInternalPromptLabel(label)) {
        const body = (rest ?? '').trim();
        return body || '';
      }
      return rest ? `### ${label}\n\n${rest}` : `### ${label}`;
    })
    .join('\n');
}

/** 将无 Markdown 结构的长段落拆成 2–3 句一段，提升扫读性。 */
function isStructuredLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (/^#{1,6}\s/.test(t)) return true;
  if (/^[-*+]\s/.test(t)) return true;
  if (/^\d+\.\s/.test(t)) return true;
  if (/^\d+[、.)）]\s/.test(t)) return true;
  if (/^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫]/.test(t)) return true;
  if (/^>\s/.test(t)) return true;
  if (/^\|/.test(t)) return true;
  if (/^---+$/.test(t)) return true;
  if (FOLLOWUP_HEAD_RE.test(t)) return true;
  return false;
}

function breakLongPlainBlocks(text: string, maxSentences = 2, minBreakLen = 56): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (isStructuredLine(line)) {
      out.push(line);
      i += 1;
      continue;
    }
    const plainLines: string[] = [];
    while (i < lines.length && !isStructuredLine(lines[i]!) && lines[i]!.trim()) {
      plainLines.push(lines[i]!);
      i += 1;
    }
    const joined = joinOrphanClosers(plainLines.join('\n').trim());
    if (!joined) continue;
    if (joined.length < minBreakLen || !/[。；！？]/.test(joined)) {
      out.push(joined);
      continue;
    }
    const withBreaks = softBreakSentences(joined);
    const sentences = withBreaks.split('\n').map((s) => s.trim()).filter(Boolean);
    if (sentences.length <= maxSentences) {
      out.push(joined);
      continue;
    }
    for (let j = 0; j < sentences.length; j += maxSentences) {
      out.push(sentences.slice(j, j + maxSentences).join(''));
      if (j + maxSentences < sentences.length) out.push('');
    }
  }
  return out.join('\n');
}

export function prepareAssistantMarkdown(text: string, streaming: boolean): string {
  let raw = streaming ? streamingSafeBody(text) : bodyText(text);
  if (streaming) {
    raw = stripTrailingReferences(raw);
    raw = joinOrphanFootnotes(raw);
  }
  raw = promoteSectionLabels(raw);
  raw = normalizeOrderedLists(raw);
  if (!streaming) {
    raw = breakLongPlainBlocks(raw);
  }
  return linkifyCitations(raw);
}

export function parseCitationHref(href?: string): number | null {
  const m = href?.match(CITE_LINK_RE);
  return m ? Number(m[1]) : null;
}

export const FOOTNOTE_RE =
  /^(\s*(?:\[\d{1,2}\]|［\d{1,2}］|【\d{1,2}】|（\d{1,2}）)\s*)+$/;

/** 半屏解读折叠态：提取摘要/概览首句（兼容 Markdown 与旧【摘要】）。 */
export function extractSummaryLead(text: string): { summary: string; body: string } {
  const mdBullet = text.match(
    /(?:^|\n)###\s*(?:摘要|本章概览|卷概览)\s*\n+\s*[-*•]\s*([^\n#]+)/,
  );
  if (mdBullet?.[1]) {
    const summary = mdBullet[1].trim();
    const body = text.replace(
      /(?:^|\n)###\s*(?:摘要|本章概览|卷概览)\s*\n+\s*[-*•]\s*[^\n#]+/,
      '',
    ).trim();
    return { summary, body };
  }
  const md = text.match(/(?:^|\n)###\s*(?:摘要|本章概览|卷概览)\s*\n+([^\n#]+)/);
  if (md?.[1]) {
    const summary = md[1].trim().replace(/^[-*•]\s+/, '');
    const body = text.replace(/(?:^|\n)###\s*(?:摘要|本章概览|卷概览)\s*\n+[^\n#]+/, '').trim();
    return { summary, body };
  }
  const legacy = text.match(/【摘要】\s*([^\n【]+)/);
  if (legacy?.[1]) {
    const summary = legacy[1].trim();
    const body = text.replace(/【摘要】\s*[^\n【]+/, '').trim();
    return { summary, body };
  }
  return { summary: '', body: text };
}

