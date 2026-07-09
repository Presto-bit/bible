/** 首页「今日轮播」：每日一题 + 今日专题（图鉴/地图/时间线/关系） */

import { chinaTodayYmd } from './daily_clock';
import { seededShuffle } from './question_bank';
import {
  diagramTourHref,
  FEATURED_DIAGRAM_IDS,
  FEATURED_GRAPH_TOPICS,
  graphTopicHref,
  mapStoryHref,
  timelineStoryHref,
} from './topic_routes';

export type TopicSlideKind = 'diagram' | 'map' | 'timeline' | 'graph';

export type TopicSlide = {
  kind: TopicSlideKind;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  badge: string;
};

const MAP_TOUR_CATALOG: { id: string; title: string; subtitle: string }[] = [
  { id: 'exodus-wilderness', title: '出埃及 · 旷野行程', subtitle: '故事模式 · 5 站导览' },
  { id: 'paul-first-journey', title: '保罗第一次宣教', subtitle: '故事模式 · 安提阿出发' },
  { id: 'jesus-ministry-galilee', title: '耶稣加利利事工', subtitle: '故事模式 · 呼召与神迹' },
];

const TIMELINE_TOUR_CATALOG: { id: string; title: string; subtitle: string }[] = [
  { id: 'life-of-jesus', title: '耶稣生平', subtitle: '时间线故事 · 降生到复活' },
  { id: 'kings-of-judah', title: '犹大诸王', subtitle: '时间线故事 · 分裂到被掳' },
];

const DIAGRAM_CATALOG: Record<string, { title: string; subtitle: string }> = {
  'tabernacle-layout': { title: '会幕布局', subtitle: '图鉴 · 可点热区游览' },
  'ark-of-covenant': { title: '约柜', subtitle: '图鉴 · 对照经文' },
  'temple-layout': { title: '圣殿布局', subtitle: '图鉴 · 可点热区游览' },
  'passover-door': { title: '逾越节门楣', subtitle: '图鉴 · 对照经文' },
};

const GRAPH_CATALOG: Record<string, { title: string; subtitle: string }> = {
  'exodus-core': { title: '出埃及核心人物', subtitle: '关系图谱 · 可追经节' },
  patriarchs: { title: '族长与后裔', subtitle: '关系图谱 · 可追经节' },
  'paul-companions': { title: '保罗与同工', subtitle: '关系图谱 · 可追经节' },
};

const TOPIC_KINDS: TopicSlideKind[] = ['diagram', 'map', 'timeline', 'graph'];

function chinaDayIndex(ymd: string): number {
  const [y, m, d] = ymd.split('-').map((n) => parseInt(n, 10));
  const start = Date.UTC(y, 0, 1);
  const cur = Date.UTC(y, m - 1, d);
  return Math.floor((cur - start) / 86_400_000);
}

export function pickDailyTopicSlide(dayYmd = chinaTodayYmd()): TopicSlide {
  const kind = TOPIC_KINDS[chinaDayIndex(dayYmd) % TOPIC_KINDS.length];

  if (kind === 'diagram') {
    const ids = [...FEATURED_DIAGRAM_IDS];
    const id = seededShuffle(ids, `${dayYmd}-diagram`)[0];
    const meta = DIAGRAM_CATALOG[id] ?? { title: id, subtitle: '图鉴 · 开始游览' };
    return {
      kind,
      id,
      title: meta.title,
      subtitle: meta.subtitle,
      href: diagramTourHref(id),
      badge: '今日专题 · 图鉴',
    };
  }

  if (kind === 'map') {
    const picked = seededShuffle(MAP_TOUR_CATALOG, `${dayYmd}-map`)[0];
    return {
      kind,
      id: picked.id,
      title: picked.title,
      subtitle: picked.subtitle,
      href: mapStoryHref(picked.id),
      badge: '今日专题 · 地图',
    };
  }

  if (kind === 'timeline') {
    const picked = seededShuffle(TIMELINE_TOUR_CATALOG, `${dayYmd}-timeline`)[0];
    return {
      kind,
      id: picked.id,
      title: picked.title,
      subtitle: picked.subtitle,
      href: timelineStoryHref(picked.id),
      badge: '今日专题 · 时间线',
    };
  }

  const ids = [...FEATURED_GRAPH_TOPICS];
  const id = seededShuffle(ids, `${dayYmd}-graph`)[0];
  const meta = GRAPH_CATALOG[id] ?? { title: id, subtitle: '关系图谱 · 开始探索' };
  return {
    kind: 'graph',
    id,
    title: meta.title,
    subtitle: meta.subtitle,
    href: graphTopicHref(id),
    badge: '今日专题 · 关系',
  };
}
