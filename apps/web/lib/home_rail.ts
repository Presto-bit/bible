/** 首页横滑卡：4 张主卡 +「更多」溢出项 */

export type RailCardKind = 'action' | 'media' | 'stat' | 'ghost';
export type RailTint = 'gold' | 'green' | 'rose' | 'slate';

export type RailCard = {
  id: string;
  kind: RailCardKind;
  tint: RailTint;
  tag: string;
  reason: string;
  title: string;
  sub: string;
  cta: string;
  href: string;
  icon: string;
  statPct?: number;
  statLabel?: string;
  progressPct?: number;
};

export type HomeMoreItem = {
  id: string;
  tag: string;
  title: string;
  sub: string;
  href: string;
  icon: string;
};

export type HomeRailInput = {
  resume?: { title: string; sub: string; href: string; progressPct?: number };
  plan?: { title: string; sub: string; href: string };
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
        reason: '你上次读到这里',
        title: input.resume.title,
        sub: input.resume.sub,
        cta: '读 ›',
        href: input.resume.href,
        icon: '📖',
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
        cta: '去读 ›',
        href: input.plan.href,
        icon: '📅',
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
        cta: '去读 ›',
        href: input.prayer.href,
        icon: '🙏',
      };
    case 'group':
      if (!input.group) return null;
      return {
        id,
        kind: 'stat',
        tint: 'green',
        tag: '小组',
        reason: '群待打卡',
        title: input.group.title,
        sub: input.group.sub,
        cta: '去打卡 ›',
        href: input.group.href,
        icon: '👥',
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
        cta: '查看 ›',
        href: input.notes?.href ?? '/notes',
        icon: '✍️',
      };
    case 'suggest':
      if (!input.suggest) return null;
      return {
        id,
        kind: 'ghost',
        tint: 'slate',
        tag: '推荐',
        reason: input.suggest.sub,
        title: input.suggest.title,
        sub: '智能推荐',
        cta: '去读 ›',
        href: input.suggest.href,
        icon: '✨',
      };
    case 'assistant':
      if (!input.assistant) return null;
      return {
        id,
        kind: 'ghost',
        tint: 'rose',
        tag: '小爱',
        reason: '基于今日经文',
        title: input.assistant.title,
        sub: input.assistant.sub,
        cta: '聊聊 ›',
        href: input.assistant.href,
        icon: '💬',
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
        cta: '开始 ›',
        href: input.challenge.href,
        icon: '🎯',
      };
    default:
      return null;
  }
}

function toMoreItem(c: RailCard): HomeMoreItem {
  return {
    id: c.id,
    tag: c.tag,
    title: c.title,
    sub: c.sub,
    href: c.href,
    icon: c.icon,
  };
}

/** 固定「更多」里始终出现的入口 */
const ALWAYS_MORE: HomeMoreItem[] = [
  { id: 'plans', tag: '计划', title: '读经计划', sub: '热门计划 · 个性定制', href: '/plans', icon: '📚' },
  { id: 'discover', tag: '发现', title: '共读群', sub: '打卡 · 任务 · 同行', href: '/discover', icon: '👥' },
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

  const main = available.slice(0, 4);
  const overflowIds = new Set(main.map((c) => c.id));
  const moreFromOverflow = available.slice(4).map(toMoreItem);
  const moreIds = new Set(moreFromOverflow.map((m) => m.id));

  const more: HomeMoreItem[] = [...moreFromOverflow];
  for (const item of ALWAYS_MORE) {
    if (!overflowIds.has(item.id) && !moreIds.has(item.id) && !main.some((c) => c.id === item.id)) {
      more.push(item);
    }
  }

  return { main, more };
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
