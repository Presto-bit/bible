/** 首页横滑卡：双列露边 · 上图标下文案（紧凑信息层级） */

export type RailIconId =
  | 'resume'
  | 'plan'
  | 'prayer'
  | 'group'
  | 'notes'
  | 'suggest'
  | 'assistant'
  | 'challenge'
  | 'plans'
  | 'discover';

export type RailCardKind = 'action' | 'media' | 'stat' | 'ghost';
export type RailTint = 'gold' | 'green' | 'rose' | 'slate';

/** 圆标固定语义，形成记忆点（统计卡圆内显示百分比，不用 icon） */
export const RAIL_ICONS: Record<string, RailIconId> = {
  resume: 'resume',
  plan: 'plan',
  prayer: 'prayer',
  group: 'group',
  notes: 'notes',
  suggest: 'suggest',
  assistant: 'assistant',
  challenge: 'challenge',
  plans: 'plans',
  discover: 'discover',
};

export type RailCard = {
  id: string;
  kind: RailCardKind;
  tint: RailTint;
  tag: string;
  reason: string;
  /** 主标题：动作结果（读到哪 / 今日经文 / 待办状态） */
  title: string;
  sub: string;
  href: string;
  icon: RailIconId;
  statPct?: number;
  statLabel?: string;
  progressPct?: number;
};

const RAIL_TITLE_MAX = 24;
const RAIL_SUB_MAX = 14;

/** 双列卡标题/副文案统一截断 */
export function trimRailTitle(text: string, max = RAIL_TITLE_MAX): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function trimRailSub(text: string, max = RAIL_SUB_MAX): string {
  const t = text.trim();
  if (!t) return '';
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function normalizeRailCard(card: RailCard): RailCard {
  const title = trimRailTitle(card.title);
  let sub = '';

  switch (card.id) {
    case 'resume':
      sub = trimRailSub(card.sub || '继续阅读');
      break;
    case 'plan':
      sub = trimRailSub(card.sub);
      break;
    case 'prayer':
      sub = trimRailSub(card.sub);
      break;
    case 'group':
      if (card.kind === 'stat' && card.statLabel) {
        sub = trimRailSub(`打卡 ${card.statLabel}`);
      } else {
        sub = trimRailSub(card.sub);
      }
      break;
    case 'assistant':
    case 'suggest':
      break;
    case 'challenge':
      sub = trimRailSub(card.sub || '巩固问答');
      break;
    case 'notes':
      sub = trimRailSub(card.title.includes('条') ? '查看全部' : (card.sub || '收藏与划线'));
      break;
    case 'plans':
    case 'discover':
      sub = trimRailSub(card.sub);
      break;
    default:
      sub = trimRailSub(card.sub);
  }

  return {
    ...card,
    title,
    sub,
    reason: '',
  };
}

export function railShowsProgress(card: RailCard): boolean {
  return (card.id === 'resume' || card.id === 'plan') && (card.progressPct ?? 0) > 0;
}

export type HomeMoreItem = {
  id: string;
  tag: string;
  title: string;
  sub: string;
  href: string;
  icon: RailIconId;
};

export type HomeRailInput = {
  resume?: { title: string; sub: string; href: string; progressPct?: number };
  plan?: { title: string; sub: string; href: string; progressPct?: number };
  prayer?: { title: string; sub: string; href: string };
  group?: { title: string; sub: string; href: string; statPct?: number; statLabel?: string };
  notes?: { title: string; sub: string; href: string; count?: number };
  suggest?: { title: string; sub: string; href: string };
  assistant?: { title: string; sub: string; href: string };
  challenge?: { title: string; sub: string; href: string };
};

const PRIORITY: string[] = [
  'resume',
  'plan',
  'prayer',
  'group',
  'challenge',
  'notes',
  'suggest',
  'assistant',
];

function cardFromId(id: string, input: HomeRailInput): RailCard | null {
  switch (id) {
    case 'resume':
      if (!input.resume) return null;
      return {
        id,
        kind: 'action',
        tint: 'gold',
        tag: '继续',
        reason: '上次读到',
        title: input.resume.title,
        sub: input.resume.sub,
        href: input.resume.href,
        icon: RAIL_ICONS.resume,
        progressPct: input.resume.progressPct,
      };
    case 'plan':
      if (!input.plan) return null;
      return {
        id,
        kind: 'media',
        tint: 'green',
        tag: '计划',
        reason: '今日计划',
        title: input.plan.title,
        sub: input.plan.sub,
        href: input.plan.href,
        icon: RAIL_ICONS.plan,
        progressPct: input.plan.progressPct,
      };
    case 'prayer':
      if (!input.prayer) return null;
      return {
        id,
        kind: 'media',
        tint: 'rose',
        tag: '祷告',
        reason: '今日祷告',
        title: input.prayer.title,
        sub: input.prayer.sub,
        href: input.prayer.href,
        icon: RAIL_ICONS.prayer,
      };
    case 'group':
      if (!input.group) return null;
      return {
        id,
        kind:
          input.group.statPct != null && input.group.statLabel ? 'stat' : 'ghost',
        tint: 'green',
        tag: '共读',
        reason: '',
        title: input.group.title,
        sub: input.group.sub,
        href: input.group.href,
        icon: RAIL_ICONS.group,
        statPct: input.group.statPct,
        statLabel: input.group.statLabel,
      };
    case 'notes':
      return {
        id,
        kind: 'ghost',
        tint: 'slate',
        tag: '笔记',
        reason: '经文记忆',
        title: input.notes?.title ?? '经文记忆',
        sub: input.notes?.sub ?? '想法 · 收藏 · 划线',
        href: input.notes?.href ?? '/notes',
        icon: RAIL_ICONS.notes,
      };
    case 'suggest':
      if (!input.suggest) return null;
      return {
        id,
        kind: 'ghost',
        tint: 'slate',
        tag: '推荐',
        reason: '为你推荐',
        title: input.suggest.title,
        sub: input.suggest.sub,
        href: input.suggest.href,
        icon: RAIL_ICONS.suggest,
      };
    case 'assistant':
      if (!input.assistant) return null;
      return {
        id,
        kind: 'ghost',
        tint: 'rose',
        tag: '小爱',
        reason: '今日经文',
        title: input.assistant.title,
        sub: input.assistant.sub,
        href: input.assistant.href,
        icon: RAIL_ICONS.assistant,
      };
    case 'challenge':
      if (!input.challenge) return null;
      return {
        id,
        kind: 'ghost',
        tint: 'gold',
        tag: '问答',
        reason: '巩固所学',
        title: input.challenge.title,
        sub: input.challenge.sub,
        href: input.challenge.href,
        icon: RAIL_ICONS.challenge,
      };
    default:
      return null;
  }
}

function moreItemToCard(item: HomeMoreItem): RailCard {
  return {
    id: item.id,
    kind: 'ghost',
    tint: 'slate',
    tag: item.tag,
    reason: item.sub.split(' · ')[0] ?? item.tag,
    title: item.title,
    sub: item.sub,
    href: item.href,
    icon: item.icon,
  };
}

/** 固定入口（无进行中计划/群时补位） */
const ALWAYS_MORE: HomeMoreItem[] = [
  {
    id: 'plans',
    tag: '计划',
    title: '读经计划',
    sub: '个性定制',
    href: '/plans',
    icon: RAIL_ICONS.plans,
  },
  {
    id: 'discover',
    tag: '小组',
    title: '共读群',
    sub: '打卡同行',
    href: '/discover',
    icon: RAIL_ICONS.discover,
  },
];

export function buildHomeRail(input: HomeRailInput): {
  main: RailCard[];
  more: HomeMoreItem[];
} {
  const available: RailCard[] = [];
  for (const id of PRIORITY) {
    if (id === 'plan' && input.prayer) continue;
    if (id === 'prayer' && input.plan) continue;
    const c = cardFromId(id, input);
    if (c) available.push(c);
  }

  const ids = new Set(available.map((c) => c.id));
  for (const item of ALWAYS_MORE) {
    if (item.id === 'discover' && ids.has('group')) continue;
    if (!ids.has(item.id)) {
      available.push(moreItemToCard(item));
      ids.add(item.id);
    }
  }

  return { main: available.map(normalizeRailCard), more: [] };
}

/** 每日经文 hero 晨曦主题 class */
export function heroThemeClass(theme?: string | null): string {
  if (!theme) return 'hero-verse-theme-dawn';
  const t = theme.toLowerCase();
  if (/创世|创造|起头/.test(t)) return 'hero-verse-theme-creation';
  if (/诗|赞美|颂/.test(t)) return 'hero-verse-theme-psalm';
  if (/福音|救|恩/.test(t)) return 'hero-verse-theme-gospel';
  if (/信|望|爱/.test(t)) return 'hero-verse-theme-faith';
  return 'hero-verse-theme-dawn';
}

export function railDotClass(kind: RailCardKind | 'more', tint?: RailTint): string {
  if (kind === 'more') return 'dot-more';
  if (kind === 'action' || tint === 'gold') return 'dot-gold';
  if (kind === 'stat' || tint === 'green') return 'dot-green';
  if (tint === 'rose') return 'dot-rose';
  return 'dot-slate';
}
