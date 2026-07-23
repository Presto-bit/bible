/** 落地页积木控件：纵向排序，内容仍落在 landing 既有字段上 */

import type { OpsCampaignLanding } from '@/lib/api';

export type OpsBlockType =
  | 'days'
  | 'schedule'
  | 'slots'
  | 'entries'
  | 'engage'
  | 'cta';

export type OpsLandingBlock = {
  id: string;
  type: OpsBlockType;
};

export const BLOCK_CATALOG: Record<
  OpsBlockType,
  { label: string; blurb: string; icon: string }
> = {
  days: { label: '日课列表', blurb: '按天阅读或背诵清单', icon: '日' },
  schedule: { label: '聚会日程', blurb: '时间、地点或线上说明', icon: '历' },
  slots: { label: '岗位报名', blurb: '岗位名称与名额', icon: '岗' },
  entries: { label: '入口卡片', blurb: '多个行动入口', icon: '链' },
  engage: { label: '互动', blurb: '点赞、评论、RSVP、代祷、提问', icon: '互' },
  cta: { label: '主按钮', blurb: '落地页主行动（自动链接）', icon: '钮' },
};

const ALL_TYPES = Object.keys(BLOCK_CATALOG) as OpsBlockType[];

function nid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function defaultBlocksForTemplate(templateId: string): OpsLandingBlock[] {
  const mk = (type: OpsBlockType): OpsLandingBlock => ({ id: nid(type), type });
  switch (templateId) {
    case 'multi_day':
    case 'verse_day':
    case 'memory':
      return [mk('days'), mk('engage'), mk('cta')];
    case 'gathering':
    case 'season':
      return [mk('schedule'), mk('engage'), mk('cta')];
    case 'serve':
      return [mk('slots'), mk('engage'), mk('cta')];
    case 'hub':
      return [mk('entries'), mk('cta')];
    case 'prayer':
      return [mk('engage'), mk('cta')];
    default:
      return [mk('cta')];
  }
}

/** 从已有落地页数据推断应有的控件（兼容旧活动无 blocks） */
export function inferBlocksFromLanding(
  landing: OpsCampaignLanding,
  templateId: string,
): OpsLandingBlock[] {
  const mk = (type: OpsBlockType): OpsLandingBlock => ({ id: nid(type), type });
  const out: OpsLandingBlock[] = [];
  const has = (t: OpsBlockType) => out.some((b) => b.type === t);

  if ((landing.days || []).length > 0 && !has('days')) out.push(mk('days'));
  if (
    (landing.schedule?.startsAt || landing.schedule?.location || landing.schedule?.onlineNote) &&
    !has('schedule')
  ) {
    out.push(mk('schedule'));
  }
  if ((landing.slots || []).length > 0 && !has('slots')) out.push(mk('slots'));
  if ((landing.entries || []).length > 0 && !has('entries')) out.push(mk('entries'));

  const f = landing.features || {};
  if (
    (f.likes || f.comments || f.rsvp || f.prayer || f.questions) &&
    !has('engage')
  ) {
    out.push(mk('engage'));
  }

  if (!out.length) return defaultBlocksForTemplate(templateId);
  if (!has('cta')) out.push(mk('cta'));
  return out;
}

export function ensureLandingBlocks(
  landing: OpsCampaignLanding,
  templateId: string,
): OpsCampaignLanding {
  const raw = Array.isArray(landing.blocks) ? landing.blocks : [];
  const cleaned = raw.filter(
    (b): b is OpsLandingBlock =>
      Boolean(b?.id && b?.type && ALL_TYPES.includes(b.type as OpsBlockType)),
  ) as OpsLandingBlock[];
  if (cleaned.length) {
    return { ...landing, blocks: cleaned };
  }
  return { ...landing, blocks: inferBlocksFromLanding(landing, templateId) };
}

export function addLandingBlock(
  landing: OpsCampaignLanding,
  type: OpsBlockType,
): OpsCampaignLanding {
  const blocks = [...(landing.blocks || [])];
  if (blocks.some((b) => b.type === type)) return landing;

  const next: OpsCampaignLanding = {
    ...landing,
    blocks: [...blocks, { id: nid(type), type }],
  };

  if (type === 'days' && !(next.days || []).length) {
    next.days = [{ day: 1, title: '第 1 天', body: '', verseRef: '', discussionHint: '' }];
    next.features = { ...(next.features || {}), dayUnlock: next.features?.dayUnlock || 'all' };
  }
  if (type === 'schedule') {
    next.schedule = { ...(next.schedule || {}) };
    next.features = { ...(next.features || {}), countdown: true };
  }
  if (type === 'slots' && !(next.slots || []).length) {
    next.slots = [{ id: nid('slot'), title: '岗位 1', limit: 5 }];
    next.features = { ...(next.features || {}), signup: true, questions: true };
  }
  if (type === 'entries' && !(next.entries || []).length) {
    next.entries = [
      { id: nid('e'), title: '入口 1', sub: '', href: '/reader' },
      { id: nid('e'), title: '入口 2', sub: '', href: '/assistant' },
    ];
  }
  if (type === 'engage') {
    next.features = {
      likes: true,
      comments: true,
      ...(next.features || {}),
    };
  }
  return next;
}

export function removeLandingBlock(
  landing: OpsCampaignLanding,
  blockId: string,
): OpsCampaignLanding {
  return {
    ...landing,
    blocks: (landing.blocks || []).filter((b) => b.id !== blockId),
  };
}

export function reorderLandingBlocks(
  landing: OpsCampaignLanding,
  fromId: string,
  toId: string,
): OpsCampaignLanding {
  const blocks = [...(landing.blocks || [])];
  const from = blocks.findIndex((b) => b.id === fromId);
  const to = blocks.findIndex((b) => b.id === toId);
  if (from < 0 || to < 0 || from === to) return landing;
  const [item] = blocks.splice(from, 1);
  blocks.splice(to, 0, item);
  return { ...landing, blocks };
}

export function availableBlockTypes(landing: OpsCampaignLanding): OpsBlockType[] {
  const used = new Set((landing.blocks || []).map((b) => b.type));
  return ALL_TYPES.filter((t) => !used.has(t));
}
