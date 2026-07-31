/** 圣经故事系列协议：出埃及剧集（可复用到后续剧集） */

import {
  diagramTourHref,
  FEATURED_DIAGRAM,
  FEATURED_GRAPH_TOPIC,
  FEATURED_MAP_TOUR,
  graphTopicHref,
  mapStoryHref,
} from './topic_routes';
import {
  getKnowledgeProgress,
  type KnowledgeProgressKind,
  type KnowledgeProgressRow,
} from './knowledge_progress';

export type StoryMedium = 'map' | 'diagram' | 'graph';

export type StoryChapter = {
  kind: StoryMedium;
  id: string;
  label: string;
  unit: string;
  /** 章首收益句 */
  hook: string;
  /** 章末收束句 */
  closing: string;
};

export type StorySeries = {
  id: string;
  title: string;
  tagline: string;
  hook: string;
  minutes: number;
  disclaimer: string;
  /** 全剧收束 */
  closing: string;
  chapters: StoryChapter[];
};

export const EXODUS_SERIES_ID = 'exodus';

/** 出埃及：三章剧集（成熟产品标杆） */
export const EXODUS_STORY: StorySeries = {
  id: EXODUS_SERIES_ID,
  title: '出埃及故事',
  tagline: '用 10 分钟，走完出埃及最关键的三件事',
  hook: '从为奴到立约：路线 · 会幕 · 人物',
  minutes: 10,
  disclaimer: '传统示意 · 非考古定论',
  closing: '从哀声到立约，神要住在百姓中间——敬拜由此开始。',
  chapters: [
    {
      kind: 'map',
      id: FEATURED_MAP_TOUR,
      label: '旷野行程',
      unit: '站',
      hook: '跟从兰塞到西奈，看立约之路如何展开。',
      closing: '百姓来到山前；接下来要看神如何住在他们中间。',
    },
    {
      kind: 'diagram',
      id: FEATURED_DIAGRAM,
      label: '会幕平面图',
      unit: '处',
      hook: '看懂外院、圣所、至圣所与约柜如何分区。',
      closing: '会幕立起，敬拜有了空间；再看神使用了哪些人。',
    },
    {
      kind: 'graph',
      id: FEATURED_GRAPH_TOPIC,
      label: '核心人物',
      unit: '段',
      hook: '理清摩西、亚伦与红海、西奈、会幕的关系脉络。',
      closing: '人与地标串起来，出埃及的因果就清楚了。',
    },
  ],
};

export function getStorySeries(id: string | null | undefined): StorySeries | null {
  if (!id || id === EXODUS_SERIES_ID) return EXODUS_STORY;
  return id === EXODUS_STORY.id ? EXODUS_STORY : null;
}

export function seriesHomeHref(seriesId: string = EXODUS_SERIES_ID): string {
  return `/search/series/${encodeURIComponent(seriesId)}`;
}

export function chapterPath(chapter: StoryChapter): string {
  switch (chapter.kind) {
    case 'map':
      return mapStoryHref(chapter.id);
    case 'diagram':
      return diagramTourHref(chapter.id);
    case 'graph':
      return graphTopicHref(chapter.id);
    default:
      return seriesHomeHref();
  }
}

/** 章深链：带 series= 进入剧集播放壳 */
export function chapterHref(
  chapter: StoryChapter,
  seriesId: string = EXODUS_SERIES_ID,
): string {
  const path = chapterPath(chapter);
  const join = path.includes('?') ? '&' : '?';
  return `${path}${join}series=${encodeURIComponent(seriesId)}`;
}

export function findChapter(
  series: StorySeries,
  kind: StoryMedium,
  id: string,
): { chapter: StoryChapter; index: number } | null {
  const index = series.chapters.findIndex((c) => c.kind === kind && c.id === id);
  if (index < 0) return null;
  return { chapter: series.chapters[index]!, index };
}

export function nextChapter(
  series: StorySeries,
  kind: StoryMedium,
  id: string,
): StoryChapter | null {
  const found = findChapter(series, kind, id);
  if (!found) return null;
  return series.chapters[found.index + 1] ?? null;
}

export function chapterProgress(
  chapter: StoryChapter,
): KnowledgeProgressRow | null {
  return getKnowledgeProgress(chapter.kind as KnowledgeProgressKind, chapter.id);
}

export type SeriesResume =
  | { kind: 'start'; href: string; label: string }
  | { kind: 'continue'; href: string; label: string; chapterLabel: string; detail: string }
  | { kind: 'done'; href: string; label: string };

/** 系列首页主 CTA：开始 / 继续 / 再看 */
export function seriesResumeAction(series: StorySeries): SeriesResume {
  for (const ch of series.chapters) {
    const row = chapterProgress(ch);
    if (!row) {
      return {
        kind: 'start',
        href: chapterHref(ch, series.id),
        label: `开始 · ${ch.label}`,
      };
    }
    if (!row.completed) {
      const at = Math.min(row.step + 1, row.total);
      return {
        kind: 'continue',
        href: chapterHref(ch, series.id),
        label: '继续观看',
        chapterLabel: ch.label,
        detail: `第 ${foundChapterIndex(series, ch) + 1}/${series.chapters.length} 章 · ${ch.label} · ${at}/${row.total} ${ch.unit}`,
      };
    }
  }
  return {
    kind: 'done',
    href: chapterHref(series.chapters[0]!, series.id),
    label: '再看一遍',
  };
}

function foundChapterIndex(series: StorySeries, chapter: StoryChapter): number {
  return series.chapters.findIndex((c) => c.kind === chapter.kind && c.id === chapter.id);
}

export function seriesCompletedCount(series: StorySeries): number {
  return series.chapters.filter((c) => chapterProgress(c)?.completed).length;
}

export function isSeriesComplete(series: StorySeries): boolean {
  return seriesCompletedCount(series) >= series.chapters.length;
}

/** 从 URL search 解析 series id（仅识别已注册剧集） */
export function parseSeriesParam(raw: string | null | undefined): string | null {
  const id = (raw || '').trim();
  if (!id) return null;
  return getStorySeries(id) ? id : null;
}
