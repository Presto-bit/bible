import {
  bodyText,
  joinOrphanFootnotes,
  streamingSafeBody,
  stripTrailingReferences,
} from '@/lib/assistant_format';

const SECTION_LABEL_RE = /^【([^】]+)】\s*(.*)$/;
const FOLLOWUP_HEAD_RE =
  /^[ \t]*(?:###\s*相关追问|【相关追问】|\[相关追问\]|相关追问\s*[:：])\s*$/;
const CITE_LINK_RE = /^#cite-(\d{1,2})$/;

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
      return rest ? `### ${label}\n\n${rest}` : `### ${label}`;
    })
    .join('\n');
}

export function prepareAssistantMarkdown(text: string, streaming: boolean): string {
  let raw = streaming ? streamingSafeBody(text) : bodyText(text);
  if (streaming) {
    raw = stripTrailingReferences(raw);
    raw = joinOrphanFootnotes(raw);
  }
  return linkifyCitations(promoteSectionLabels(raw));
}

export function parseCitationHref(href?: string): number | null {
  const m = href?.match(CITE_LINK_RE);
  return m ? Number(m[1]) : null;
}

export const FOOTNOTE_RE =
  /^(\s*(?:\[\d{1,2}\]|［\d{1,2}］|【\d{1,2}】|（\d{1,2}）)\s*)+$/;

/** 半屏解读折叠态：提取摘要首句（兼容 Markdown 与旧【摘要】）。 */
export function extractSummaryLead(text: string): { summary: string; body: string } {
  const md = text.match(/(?:^|\n)###\s*摘要\s*\n+([^\n#]+)/);
  if (md?.[1]) {
    const summary = md[1].trim();
    const body = text.replace(/(?:^|\n)###\s*摘要\s*\n+[^\n#]+/, '').trim();
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

