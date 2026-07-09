/** Hero B 结构化链接解析（与 API hero_b_link.py 对齐） */

export type HeroBLink = {
  kind: string;
  params?: Record<string, string | number>;
};

export function resolveHeroBHref(link: HeroBLink): string {
  const params = link.params ?? {};
  const kind = link.kind;

  if (kind === 'tab') {
    const tab = String(params.tab ?? 'home');
    const map: Record<string, string> = {
      home: '/',
      reader: '/reader',
      discover: '/discover',
      challenge: '/challenge',
      assistant: '/assistant',
      profile: '/profile',
    };
    const href = map[tab];
    if (!href) throw new Error(`未知 tab: ${tab}`);
    return href;
  }
  if (kind === 'reader') {
    const book = String(params.book ?? 'GEN');
    const chapter = Number(params.chapter ?? 1);
    return `/reader?book=${encodeURIComponent(book)}&chapter=${chapter}`;
  }
  if (kind === 'challenge') return '/challenge';
  if (kind === 'assistant') return '/assistant';
  if (kind === 'plans') {
    const planId = params.planId;
    return planId ? `/plans?plan=${encodeURIComponent(String(planId))}` : '/plans';
  }
  if (kind === 'map') {
    const tourId = String(params.tourId ?? '');
    if (!tourId) throw new Error('缺少 tourId');
    return `/search/map/${encodeURIComponent(tourId)}`;
  }
  if (kind === 'timeline') {
    const tourId = String(params.tourId ?? '');
    if (!tourId) throw new Error('缺少 tourId');
    return `/search/timeline/${encodeURIComponent(tourId)}`;
  }
  if (kind === 'diagram') {
    const diagramId = String(params.diagramId ?? '');
    if (!diagramId) throw new Error('缺少 diagramId');
    return `/search/diagrams/${encodeURIComponent(diagramId)}`;
  }
  if (kind === 'graph') {
    const topicId = String(params.topicId ?? '');
    if (!topicId) throw new Error('缺少 topicId');
    return `/search/graph/${encodeURIComponent(topicId)}`;
  }
  if (kind === 'discover') {
    const view = String(params.view ?? 'home');
    if (view === 'join') return '/discover/join';
    if (view === 'group') {
      const groupId = String(params.groupId ?? '');
      if (!groupId) throw new Error('缺少 groupId');
      return `/discover/group/${encodeURIComponent(groupId)}`;
    }
    return '/discover';
  }
  if (kind === 'path') {
    const path = String(params.path ?? '');
    if (!path.startsWith('/') || path.startsWith('//')) {
      throw new Error('path 必须以 / 开头');
    }
    return path;
  }
  throw new Error(`未知 link.kind: ${kind}`);
}

export type LinkCatalog = {
  tabs: { id: string; label: string }[];
  maps: { id: string; label: string }[];
  timelines: { id: string; label: string }[];
  diagrams: { id: string; label: string }[];
  graphs: { id: string; label: string }[];
  discoverViews: { id: string; label: string }[];
};

export const DEFAULT_LINK_CATALOG: LinkCatalog = {
  tabs: [
    { id: 'home', label: '首页' },
    { id: 'reader', label: '读经' },
    { id: 'discover', label: '发现' },
    { id: 'challenge', label: '闯关' },
    { id: 'assistant', label: '小爱' },
    { id: 'profile', label: '我的' },
  ],
  maps: [
    { id: 'exodus-wilderness', label: '出埃及 · 旷野行程' },
    { id: 'paul-first-journey', label: '保罗第一次宣教' },
    { id: 'jesus-ministry-galilee', label: '耶稣加利利事工' },
  ],
  timelines: [
    { id: 'life-of-jesus', label: '耶稣生平' },
    { id: 'kings-of-judah', label: '犹大诸王' },
  ],
  diagrams: [
    { id: 'tabernacle-layout', label: '会幕布局' },
    { id: 'ark-of-covenant', label: '约柜' },
    { id: 'temple-layout', label: '圣殿布局' },
    { id: 'passover-door', label: '逾越节门楣' },
  ],
  graphs: [
    { id: 'exodus-core', label: '出埃及核心人物' },
    { id: 'patriarchs', label: '族长与后裔' },
    { id: 'paul-companions', label: '保罗与同工' },
  ],
  discoverViews: [
    { id: 'home', label: '发现首页' },
    { id: 'join', label: '加入群组' },
  ],
};
