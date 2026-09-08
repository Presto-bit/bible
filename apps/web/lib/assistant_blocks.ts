import { bodyText } from '@/lib/assistant_format';

export type TimelineNode = {
  year: string;
  label: string;
  note?: string;
};

export type AnswerBlock =
  | { type: 'lead'; text: string }
  | { type: 'timeline'; items: TimelineNode[] }
  | { type: 'list'; title: string; items: string[] }
  | { type: 'paragraph'; title: string; text: string };

export type StructureAsset = {
  kind: 'timeline' | 'diagram' | 'graph';
  id: string;
  label: string;
  subtitle?: string;
  href?: string;
  nodes?: TimelineNode[];
};

const TIMELINE_SECTION_TITLES = new Set([
  '时间线',
  '年代脉络',
  '历史脉络',
  '人物生平',
  '年代',
]);
const TIMELINE_ITEM_RE = /^\s*(?:[-*•]|\d+[.)、])\s+\*\*(.+?)\*\*\s*(.*)$/;

/** 从 ### 时间线 等小节反解析竖轴节点。 */
export function parseTimelineNodes(text: string): TimelineNode[] {
  const body = bodyText(text).trim();
  if (!body) return [];
  const titles = [...TIMELINE_SECTION_TITLES].join('|');
  const sectionRe = new RegExp(`(?:^|\\n)###\\s+(?:${titles})\\s*\\n`, 'm');
  const m = sectionRe.exec(body);
  if (!m) return [];
  const tail = body.slice(m.index + m[0].length);
  const nextIdx = tail.search(/\n###\s+/);
  const chunk = nextIdx >= 0 ? tail.slice(0, nextIdx) : tail;
  const nodes: TimelineNode[] = [];
  for (const line of chunk.split('\n')) {
    const mm = line.trim().match(TIMELINE_ITEM_RE);
    if (!mm?.[1]) continue;
    const year = mm[1].trim();
    const note = (mm[2] ?? '').trim();
    nodes.push({ year, label: note || year, note });
  }
  return nodes.slice(0, 8);
}

/** Markdown 正文反解析 blocks（与服务端 parse_answer_blocks 对齐）。 */
export function parseAnswerBlocks(text: string): {
  lead: string;
  blocks: AnswerBlock[];
  timeline: TimelineNode[];
} {
  const body = bodyText(text);
  const leadM = body.match(/(?:^|\n)###\s*(?:摘要|本章概览|卷概览)\s*\n+([^\n#]+)/);
  const lead = leadM?.[1]?.trim() ?? '';
  const blocks: AnswerBlock[] = [];
  if (lead) blocks.push({ type: 'lead', text: lead });
  const timeline = parseTimelineNodes(body);
  if (timeline.length) blocks.push({ type: 'timeline', items: timeline });
  return { lead, blocks, timeline };
}

/** 流式阶段：哪些小节标题后已有正文。 */
export function streamingWrittenSections(
  text: string,
  sections: { id: string; title: string }[],
): Set<string> {
  const written = new Set<string>();
  const body = bodyText(text);
  for (const sec of sections) {
    const re = new RegExp(
      `(?:^|\\n)###\\s+${sec.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n+\\S`,
      'm',
    );
    if (re.test(body)) written.add(sec.id);
  }
  return written;
}

/** 查经/讲道 sheet：提取可复制的讨论题块。 */
export function extractStudySheetCopyText(text: string): string {
  const body = bodyText(text);
  const m = body.match(/(?:^|\n)###\s*讨论问题\s*\n([\s\S]*?)(?=\n###\s+|$)/);
  if (!m?.[1]) return '';
  return m[1]
    .split('\n')
    .map((ln) => ln.replace(/^\s*(?:[-*•]|\d+[.)、])\s+/, '').trim())
    .filter(Boolean)
    .map((q, i) => `${i + 1}. ${q}`)
    .join('\n\n');
}
