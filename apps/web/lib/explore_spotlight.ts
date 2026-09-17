/** 首页探索坑：按日稳定挑专题（今日默认保罗首发） */

import type { KnowledgeLayoutSummary } from './api';
import { chinaTodayYmd } from './daily_clock';
import { knowledgeMediaBadge, resolveKnowledgeTopicMeta } from './knowledge_topic_meta';

export type ExploreSpotlight = {
  id: string;
  title: string;
  hook: string;
  href: string;
  coverUrl: string;
  /** 有音/视频时「听」「看」 */
  mediaBadge?: string | null;
};

const PAUL_ID = 'paul-first-journey';

function shortTitle(title: string): string {
  const t = title.replace(/\s+/g, '').trim();
  if (t.length <= 8) return t;
  return t.slice(0, 8);
}

function shortHook(guide?: string): string {
  const g = (guide || '').replace(/\s+/g, ' ').trim();
  if (!g) return '彼爱手稿';
  if (g.length <= 14) return g;
  return `${g.slice(0, 13)}…`;
}

function coverOf(row: KnowledgeLayoutSummary): string {
  const id = row.id || '';
  // 首页坑用轻量图，勿用 comic 密图
  if (id === PAUL_ID) {
    return '/knowledge/infographics/paul-first-journey.png';
  }
  if (id === 'exodus-wilderness') {
    return '/knowledge/vignettes/wilderness/00_overview.png';
  }
  if (id === 'jesus-ministry-galilee') {
    return '/knowledge/infographics/jesus-ministry-galilee-comic.png';
  }
  if (row.cover_image) return row.cover_image;
  return '/knowledge/infographics/_paper_texture.jpg';
}

function isNoteRow(row: KnowledgeLayoutSummary): boolean {
  return (
    row.kind === 'note' ||
    row.source?.kind === 'note' ||
    (row.id || '').startsWith('note-')
  );
}

function isPaulRow(row: KnowledgeLayoutSummary): boolean {
  const id = row.id || '';
  const sid = row.source?.id || '';
  return id === PAUL_ID || sid === PAUL_ID;
}

function toSpotlight(row: KnowledgeLayoutSummary, fallbackIndex = 0): ExploreSpotlight {
  const id = row.id || `topic-${fallbackIndex}`;
  const sourceId = row.source?.id || id;
  const href = isNoteRow(row)
    ? `/knowledge/${encodeURIComponent(sourceId)}?view=1`
    : `/search/map/${encodeURIComponent(sourceId)}?view=1`;
  const meta = resolveKnowledgeTopicMeta(row);
  return {
    id,
    title: shortTitle(row.title || id),
    hook: shortHook(row.guide_one_liner),
    href,
    coverUrl: coverOf(row),
    mediaBadge: knowledgeMediaBadge(meta.media),
  };
}

/** 从探索 href 解析手稿 id（行程 / 笔记） */
export function manuscriptIdFromExploreHref(href: string): string {
  const raw = (href || '').trim();
  if (!raw) return '';
  const note = raw.match(/\/knowledge\/([^/?#]+)/);
  if (note?.[1]) return decodeURIComponent(note[1]);
  const tour = raw.match(/\/search\/map\/([^/?#]+)/);
  if (tour?.[1]) return decodeURIComponent(tour[1]);
  return '';
}

/**
 * 今日探索默认保罗首发；列表无保罗时回退到首条行程，再回退首条。
 * dayKey 保留签名以兼容调用方。
 */
export function pickExploreSpotlight(
  layouts: KnowledgeLayoutSummary[],
  _dayKey = chinaTodayYmd(),
): ExploreSpotlight | null {
  if (!layouts.length) return null;
  const paul = layouts.find(isPaulRow);
  if (paul) return toSpotlight(paul);
  const journey = layouts.find((r) => !isNoteRow(r));
  if (journey) return toSpotlight(journey);
  return toSpotlight(layouts[0]!, 0);
}

export const DEFAULT_EXPLORE_SPOTLIGHT: ExploreSpotlight = {
  id: PAUL_ID,
  title: '保罗首发',
  hook: '安提阿到加拉太',
  href: `/search/map/${PAUL_ID}?view=1`,
  coverUrl: '/knowledge/infographics/paul-first-journey.png',
  mediaBadge: null,
};
