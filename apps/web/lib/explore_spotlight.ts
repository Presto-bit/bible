/** 首页探索坑：按日稳定随机挑一个专题封面缩写 */

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

function hashDay(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

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
  if (row.cover_image) return row.cover_image;
  if (row.id === 'exodus-wilderness') return '/knowledge/vignettes/wilderness/00_overview.png';
  if (row.id === 'paul-first-journey') {
    return '/knowledge/infographics/paul-first-journey-comic.png';
  }
  return '/knowledge/infographics/_paper_texture.jpg';
}

function isNoteRow(row: KnowledgeLayoutSummary): boolean {
  return (
    row.kind === 'note' ||
    row.source?.kind === 'note' ||
    (row.id || '').startsWith('note-')
  );
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

/** 按中国日历日从 layouts 中稳定抽取一条 */
export function pickExploreSpotlight(
  layouts: KnowledgeLayoutSummary[],
  dayKey = chinaTodayYmd(),
): ExploreSpotlight | null {
  if (!layouts.length) return null;
  const i = hashDay(`explore:${dayKey}`) % layouts.length;
  const row = layouts[i]!;
  const id = row.id || `topic-${i}`;
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

export const DEFAULT_EXPLORE_SPOTLIGHT: ExploreSpotlight = {
  id: 'explore',
  title: '探索手稿',
  hook: '经文结构速览',
  href: '/knowledge',
  coverUrl: '/knowledge/infographics/paul-first-journey-comic.png',
  mediaBadge: null,
};
