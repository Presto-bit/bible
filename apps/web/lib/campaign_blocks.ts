/** 落地页积木：分类控件库 + 纵向搭建（内容可挂在 block.data） */

import type { OpsCampaignLanding } from '@/lib/api';

export type OpsBlockCategory =
  | 'content'
  | 'bible'
  | 'action'
  | 'gathering'
  | 'engage'
  | 'layout';

export type OpsBlockType =
  | 'text'
  | 'audio'
  | 'image'
  | 'divider'
  | 'verse'
  | 'days'
  | 'schedule'
  | 'slots'
  | 'entries'
  | 'engage'
  | 'cta'
  | 'tabs';

export type OpsLandingBlock = {
  id: string;
  type: OpsBlockType;
  /** 多实例控件内容；单例业务控件仍同步到 landing 顶层字段 */
  data?: Record<string, unknown>;
};

export type BlockMeta = {
  label: string;
  blurb: string;
  icon: string;
  category: OpsBlockCategory;
  /** 同类型是否允许多个 */
  multi: boolean;
};

export const BLOCK_CATEGORIES: { id: OpsBlockCategory; label: string }[] = [
  { id: 'content', label: '内容' },
  { id: 'bible', label: '圣经' },
  { id: 'layout', label: '布局' },
  { id: 'action', label: '行动' },
  { id: 'gathering', label: '聚会报名' },
  { id: 'engage', label: '互动' },
];

export const BLOCK_CATALOG: Record<OpsBlockType, BlockMeta> = {
  text: {
    label: '文本',
    blurb: '标题与正文段落',
    icon: '文',
    category: 'content',
    multi: true,
  },
  audio: {
    label: '音频',
    blurb: '嵌入音频播放',
    icon: '音',
    category: 'content',
    multi: true,
  },
  image: {
    label: '图片',
    blurb: '图片与说明',
    icon: '图',
    category: 'content',
    multi: true,
  },
  divider: {
    label: '分割线',
    blurb: '分隔内容区块',
    icon: '线',
    category: 'content',
    multi: true,
  },
  verse: {
    label: '经文引用',
    blurb: '经文出处与短注',
    icon: '经',
    category: 'bible',
    multi: true,
  },
  days: {
    label: '日课列表',
    blurb: '按天阅读或背诵',
    icon: '日',
    category: 'bible',
    multi: false,
  },
  tabs: {
    label: 'Tab 分组',
    blurb: '多标签切换内容',
    icon: 'Tab',
    category: 'layout',
    multi: true,
  },
  cta: {
    label: '主按钮',
    blurb: '落地页主行动',
    icon: '钮',
    category: 'action',
    multi: false,
  },
  entries: {
    label: '入口卡片',
    blurb: '多个行动入口',
    icon: '链',
    category: 'action',
    multi: false,
  },
  schedule: {
    label: '聚会日程',
    blurb: '时间地点或线上',
    icon: '历',
    category: 'gathering',
    multi: false,
  },
  slots: {
    label: '岗位报名',
    blurb: '岗位与名额',
    icon: '岗',
    category: 'gathering',
    multi: false,
  },
  engage: {
    label: '互动',
    blurb: '赞评 RSVP 代祷提问',
    icon: '互',
    category: 'engage',
    multi: false,
  },
};

const ALL_TYPES = Object.keys(BLOCK_CATALOG) as OpsBlockType[];

export function nid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function isOpsBlockType(v: unknown): v is OpsBlockType {
  return typeof v === 'string' && ALL_TYPES.includes(v as OpsBlockType);
}

export function defaultDataForType(type: OpsBlockType): Record<string, unknown> {
  switch (type) {
    case 'text':
      return { heading: '', body: '', role: 'section' };
    case 'audio':
      return { title: '音频', src: '', caption: '' };
    case 'image':
      return { url: '', caption: '' };
    case 'divider':
      return { style: 'line' };
    case 'verse':
      return { ref: '', note: '' };
    case 'tabs':
      return {
        tabs: [
          { id: nid('tab'), label: '标签 1', body: '' },
          { id: nid('tab'), label: '标签 2', body: '' },
        ],
      };
    default:
      return {};
  }
}

function mk(
  type: OpsBlockType,
  data?: Record<string, unknown>,
  stableId?: string,
): OpsLandingBlock {
  const base: OpsLandingBlock = { id: stableId || nid(type), type };
  if (BLOCK_CATALOG[type].multi || data) {
    base.data = { ...defaultDataForType(type), ...(data || {}) };
  }
  return base;
}

export function defaultBlocksForTemplate(templateId: string): OpsLandingBlock[] {
  const intro = mk('text', {
    heading: '',
    body: '',
    role: 'intro',
  });
  switch (templateId) {
    case 'blank':
      return [intro, mk('cta')];
    case 'multi_day':
    case 'verse_day':
    case 'memory':
      return [intro, mk('days'), mk('engage'), mk('cta')];
    case 'gathering':
    case 'season':
      return [intro, mk('schedule'), mk('engage'), mk('cta')];
    case 'serve':
      return [intro, mk('slots'), mk('engage'), mk('cta')];
    case 'hub':
      return [intro, mk('entries'), mk('cta')];
    case 'prayer':
    case 'prayer_drive':
      return [intro, mk('engage'), mk('cta')];
    default:
      return [intro, mk('cta')];
  }
}

/** 旧活动：把顶层字段迁成控件顺序 */
export function inferBlocksFromLanding(
  landing: OpsCampaignLanding,
  templateId: string,
): OpsLandingBlock[] {
  const out: OpsLandingBlock[] = [];
  const has = (t: OpsBlockType) => out.some((b) => b.type === t);

  const body = (landing.body || '').trim();
  out.push(
    mk(
      'text',
      {
        heading: (landing.title || '').trim(),
        body,
        role: 'intro',
      },
      'legacy_intro',
    ),
  );

  if ((landing.days || []).length > 0 && !has('days')) out.push(mk('days', undefined, 'legacy_days'));
  if (
    (landing.schedule?.startsAt || landing.schedule?.location || landing.schedule?.onlineNote) &&
    !has('schedule')
  ) {
    out.push(mk('schedule', undefined, 'legacy_schedule'));
  }
  if ((landing.slots || []).length > 0 && !has('slots')) out.push(mk('slots', undefined, 'legacy_slots'));
  if ((landing.entries || []).length > 0 && !has('entries')) {
    out.push(mk('entries', undefined, 'legacy_entries'));
  }

  const f = landing.features || {};
  if ((f.likes || f.comments || f.rsvp || f.prayer || f.questions) && !has('engage')) {
    out.push(mk('engage', undefined, 'legacy_engage'));
  }

  if (!has('cta')) out.push(mk('cta', undefined, 'legacy_cta'));

  // 若完全空且无正文，回退模板默认
  if (!body && out.length <= 2 && !(landing.days || []).length) {
    return defaultBlocksForTemplate(templateId);
  }
  return out;
}

export function normalizeBlocks(raw: unknown): OpsLandingBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: OpsLandingBlock[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.id !== 'string' || !isOpsBlockType(rec.type)) continue;
    const block: OpsLandingBlock = { id: rec.id, type: rec.type };
    if (rec.data && typeof rec.data === 'object') {
      block.data = rec.data as Record<string, unknown>;
    } else if (BLOCK_CATALOG[rec.type].multi) {
      block.data = defaultDataForType(rec.type);
    }
    out.push(block);
  }
  return out;
}

/** 同步 intro 文本控件 ↔ landing.body / title */
export function syncIntroTextToLanding(landing: OpsCampaignLanding): OpsCampaignLanding {
  const blocks = normalizeBlocks(landing.blocks);
  const intro = blocks.find(
    (b) => b.type === 'text' && (b.data?.role === 'intro' || b.data?.role === 'body'),
  );
  if (!intro?.data) return { ...landing, blocks };
  const body = String(intro.data.body || '');
  const heading = String(intro.data.heading || '').trim();
  return {
    ...landing,
    blocks,
    body,
    title: heading || landing.title,
  };
}

export function ensureLandingBlocks(
  landing: OpsCampaignLanding,
  templateId: string,
): OpsCampaignLanding {
  const cleaned = normalizeBlocks(landing.blocks);
  if (cleaned.length) {
    // 旧版无 text 时补 intro
    const hasText = cleaned.some((b) => b.type === 'text');
    if (!hasText && (landing.body || '').trim()) {
      cleaned.unshift(
        mk('text', {
          heading: (landing.title || '').trim(),
          body: landing.body || '',
          role: 'intro',
        }),
      );
    }
    return syncIntroTextToLanding({ ...landing, blocks: cleaned });
  }
  return syncIntroTextToLanding({
    ...landing,
    blocks: inferBlocksFromLanding(landing, templateId),
  });
}

export function addLandingBlock(
  landing: OpsCampaignLanding,
  type: OpsBlockType,
): OpsCampaignLanding {
  const blocks = normalizeBlocks(landing.blocks);
  const meta = BLOCK_CATALOG[type];
  if (!meta.multi && blocks.some((b) => b.type === type)) return landing;

  const block = mk(type);
  const next: OpsCampaignLanding = {
    ...landing,
    blocks: [...blocks, block],
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
    next.features = { likes: true, comments: true, ...(next.features || {}) };
  }
  if (type === 'text' && block.data?.role === 'intro') {
    return syncIntroTextToLanding(next);
  }
  return next;
}

export function removeLandingBlock(
  landing: OpsCampaignLanding,
  blockId: string,
): OpsCampaignLanding {
  return syncIntroTextToLanding({
    ...landing,
    blocks: normalizeBlocks(landing.blocks).filter((b) => b.id !== blockId),
  });
}

export function reorderLandingBlocks(
  landing: OpsCampaignLanding,
  fromId: string,
  toId: string,
): OpsCampaignLanding {
  const blocks = normalizeBlocks(landing.blocks);
  const from = blocks.findIndex((b) => b.id === fromId);
  const to = blocks.findIndex((b) => b.id === toId);
  if (from < 0 || to < 0 || from === to) return landing;
  const [item] = blocks.splice(from, 1);
  blocks.splice(to, 0, item);
  return { ...landing, blocks };
}

export function updateBlockData(
  landing: OpsCampaignLanding,
  blockId: string,
  data: Record<string, unknown>,
): OpsCampaignLanding {
  const blocks = normalizeBlocks(landing.blocks).map((b) =>
    b.id === blockId ? { ...b, data: { ...(b.data || {}), ...data } } : b,
  );
  return syncIntroTextToLanding({ ...landing, blocks });
}

export function availableBlockTypes(landing: OpsCampaignLanding): OpsBlockType[] {
  const blocks = normalizeBlocks(landing.blocks);
  const used = new Set(blocks.map((b) => b.type));
  return ALL_TYPES.filter((t) => BLOCK_CATALOG[t].multi || !used.has(t));
}

export function blocksByCategory(
  types: OpsBlockType[],
): { category: OpsBlockCategory; label: string; types: OpsBlockType[] }[] {
  return BLOCK_CATEGORIES.map((c) => ({
    category: c.id,
    label: c.label,
    types: types.filter((t) => BLOCK_CATALOG[t].category === c.id),
  })).filter((g) => g.types.length > 0);
}

export function blockSummary(block: OpsLandingBlock): string {
  const d = block.data || {};
  switch (block.type) {
    case 'text':
      return String(d.heading || d.body || '空文本').slice(0, 28);
    case 'audio':
      return String(d.title || d.src || '未设置音频').slice(0, 28);
    case 'image':
      return String(d.caption || d.url || '未设置图片').slice(0, 28);
    case 'verse':
      return String(d.ref || '未填经文').slice(0, 28);
    case 'tabs': {
      const tabs = Array.isArray(d.tabs) ? d.tabs : [];
      return `${tabs.length} 个标签`;
    }
    case 'divider':
      return d.style === 'space' ? '空白间距' : '分割线';
    default:
      return BLOCK_CATALOG[block.type].blurb;
  }
}
