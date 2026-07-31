/** 知识导览：相关线、问小爱、系列、列表文案、首屏 hook */

import {
  diagramTourHref,
  FEATURED_DIAGRAM,
  FEATURED_GRAPH_TOPIC,
  FEATURED_MAP_TOUR,
  graphTopicHref,
  mapStoryHref,
  timelineStoryHref,
} from './topic_routes';

export type KnowledgeRelatedKind = 'map' | 'timeline' | 'graph' | 'diagram';

export type KnowledgeRelatedLink = {
  kind: KnowledgeRelatedKind;
  id: string;
  label: string;
};

export function knowledgeRelatedHref(link: KnowledgeRelatedLink): string {
  switch (link.kind) {
    case 'map':
      return mapStoryHref(link.id);
    case 'timeline':
      return timelineStoryHref(link.id);
    case 'graph':
      return graphTopicHref(link.id);
    case 'diagram':
      return diagramTourHref(link.id);
    default:
      return '/search';
  }
}

export function knowledgeAskQuestion(opts: {
  title: string;
  stopLabel?: string;
  askSeed?: string;
  ref?: string;
}): string {
  if (opts.askSeed?.trim()) return opts.askSeed.trim();
  const where = opts.stopLabel ? `「${opts.stopLabel}」` : '';
  const refBit = opts.ref ? `（经文 ${opts.ref}）` : '';
  return `请结合圣经知识专题「${opts.title}」${where}${refBit}，用简明语言解释这段在整体叙事中的意义，并建议下一步可读的经文。`;
}

export function estimateTourMinutes(stopCount: number): number {
  return Math.max(2, Math.round(stopCount * 0.8));
}

/** 旗舰系列：出埃及三件套（与单线 hook 拆开写） */
export const EXODUS_SERIES = {
  id: 'exodus',
  title: '出埃及故事',
  hook: '三件串完：旷野路线 → 会幕分区 → 核心人物',
  minutes: 10,
  steps: [
    { kind: 'map' as const, id: FEATURED_MAP_TOUR, label: '旷野行程', unit: '站' },
    { kind: 'diagram' as const, id: FEATURED_DIAGRAM, label: '会幕平面图', unit: '处' },
    { kind: 'graph' as const, id: FEATURED_GRAPH_TOPIC, label: '核心人物', unit: '段' },
  ],
};

export function seriesStepHref(step: (typeof EXODUS_SERIES.steps)[number]): string {
  return knowledgeRelatedHref({ kind: step.kind, id: step.id, label: step.label });
}

/** 当前线在系列中的下一件；非系列成员返回 null */
export function nextInExodusSeries(
  kind: KnowledgeRelatedKind,
  id: string,
): KnowledgeRelatedLink | null {
  const idx = EXODUS_SERIES.steps.findIndex((s) => s.kind === kind && s.id === id);
  if (idx < 0 || idx >= EXODUS_SERIES.steps.length - 1) return null;
  const next = EXODUS_SERIES.steps[idx + 1];
  return { kind: next.kind, id: next.id, label: next.label };
}

export function exodusSeriesIndex(kind: KnowledgeRelatedKind, id: string): number {
  return EXODUS_SERIES.steps.findIndex((s) => s.kind === kind && s.id === id);
}

/** 进线首屏 / 列表主行：用户能带走什么（15–32 字） */
export const TOUR_HOOKS: Record<string, string> = {
  // 地图
  [FEATURED_MAP_TOUR]: '跟从兰塞到西奈，看立约之路如何展开。',
  'paul-first-journey': '跟保罗第一次宣教，看教会如何向外邦开门。',
  'jesus-ministry-galilee': '跟随加利利事工路线，看见呼召与神迹的地理焦点。',
  // 时间线
  'life-of-jesus': '按关键节点串起降生、事工、受难与复活。',
  'kings-of-judah': '从分裂到被掳，看见犹大诸王的关键转折。',
  // 关系
  [FEATURED_GRAPH_TOPIC]: '理清摩西、亚伦与红海、西奈、会幕的关系脉络。',
  'twelve-disciples': '看耶稣与门徒如何被呼召、动摇又被重建。',
  'david-line': '从大卫到所罗门，理清王室传承的关键节点。',
  'paul-companions': '理清保罗与同工在第一次宣教中的伙伴关系。',
  'patriarchs': '从亚伯拉罕到约瑟，串起应许与族谱主线。',
  'jesus-ministry-places': '把迦百农与耶路撒冷放回事工地理里。',
  // 图鉴
  [FEATURED_DIAGRAM]: '看懂外院、圣所、至圣所与约柜如何分区。',
  'ark-of-covenant': '看清法版、施恩座与基路伯在约柜上的结构。',
  'temple-layout': '对照会幕，看所罗门圣殿的庭院与分区。',
  'passover-door': '理解门楣涂血与「越过」的拯救记号。',
  'red-sea-crossing': '理解过红海如何显明神的拯救与权能。',
  'showbread-table': '看圣所内陈设饼桌与灯台的位置关系。',
};

export function tourHook(id: string | undefined | null): string | null {
  if (!id) return null;
  return TOUR_HOOKS[id] ?? null;
}

export function knowledgeKindLabel(kind: KnowledgeRelatedKind): string {
  switch (kind) {
    case 'map':
      return '地图故事';
    case 'timeline':
      return '时间故事';
    case 'graph':
      return '关系专题';
    case 'diagram':
      return '图鉴馆';
    default:
      return '圣经知识';
  }
}

/** 列表 / 轨卡 CTA（按类型分化） */
export function knowledgeKindCta(kind: KnowledgeRelatedKind): string {
  switch (kind) {
    case 'map':
      return '按站走 ›';
    case 'timeline':
      return '按节点 ›';
    case 'graph':
      return '理清脉络 ›';
    case 'diagram':
      return '点图导读 ›';
    default:
      return '开始 ›';
  }
}

export function knowledgeKindUnit(kind: KnowledgeRelatedKind): string {
  switch (kind) {
    case 'map':
      return '站';
    case 'timeline':
      return '个节点';
    case 'graph':
      return '段';
    case 'diagram':
      return '处';
    default:
      return '步';
  }
}

/** 计量次行：`6 站 · 约 5 分钟` */
export function knowledgeCountMeta(
  count: number,
  kind: KnowledgeRelatedKind,
): string {
  if (count <= 0) return '';
  const unit = knowledgeKindUnit(kind);
  const mins = estimateTourMinutes(count);
  return `${count} ${unit} · 约 ${mins} 分钟`;
}

/** 列表页导语 */
export function knowledgeListLead(kind: KnowledgeRelatedKind): string {
  switch (kind) {
    case 'map':
      return '按地点走一遍，把故事放回地图上。';
    case 'timeline':
      return '按节点走一遍，看见关键转折。';
    case 'graph':
      return '一段一段理清人物与地标关系。';
    case 'diagram':
      return '点热区按序读，把结构看懂。';
    default:
      return '选一条知识线，边走边读。';
  }
}

export function clipShareBody(text: string, max = 96): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}
