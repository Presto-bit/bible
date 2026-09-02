/**
 * 安卓 Flutter 壳允许嵌 H5 的路径白名单（与 PRODUCT §24 对齐）。
 * 白名单外不得随手嵌 Web。
 * 变更须同步 apps/mobile/lib/core/h5_whitelist.dart。
 */

export type H5Surface =
  | 'discover_im'
  | 'campaign'
  | 'legal_help'
  | 'profile_secondary'
  | 'settings_web'
  | 'friend_group'
  | 'pray'
  | 'story_series';

export type H5WhitelistEntry = {
  surface: H5Surface;
  /** path 前缀或完整 path；leading slash */
  pathPrefix: string;
  note?: string;
};

/** 白名单：新增须同步 PRODUCT §24.3 与 apps/mobile h5_whitelist.dart */
export const H5_WHITELIST: readonly H5WhitelistEntry[] = [
  { surface: 'discover_im', pathPrefix: '/discover', note: '发现/IM 全链路' },
  { surface: 'campaign', pathPrefix: '/campaigns', note: '活动运营落地' },
  { surface: 'campaign', pathPrefix: '/campaign', note: '活动别名' },
  { surface: 'pray', pathPrefix: '/pray', note: '祷告会话（H5 单源）' },
  {
    surface: 'story_series',
    pathPrefix: '/search/series',
    note: '故事图册（出埃及等）',
  },
  {
    surface: 'story_series',
    pathPrefix: '/search/map',
    note: '地图故事',
  },
  {
    surface: 'story_series',
    pathPrefix: '/search/timeline',
    note: '历史时间线故事',
  },
  {
    surface: 'story_series',
    pathPrefix: '/search/graph',
    note: '关系专题故事',
  },
  {
    surface: 'story_series',
    pathPrefix: '/search/diagrams',
    note: '圣经图鉴故事',
  },
  { surface: 'legal_help', pathPrefix: '/help', note: '帮助中心' },
  { surface: 'legal_help', pathPrefix: '/feedback', note: '反馈' },
  { surface: 'legal_help', pathPrefix: '/legal', note: '协议/隐私' },
  { surface: 'legal_help', pathPrefix: '/terms', note: '用户协议（若独立路由）' },
  { surface: 'legal_help', pathPrefix: '/privacy', note: '隐私（若独立路由）' },
  { surface: 'profile_secondary', pathPrefix: '/report', note: '阅读报告等我的二级' },
  { surface: 'profile_secondary', pathPrefix: '/wrapped', note: '故事回顾（我的二级）' },
  { surface: 'profile_secondary', pathPrefix: '/shelf', note: '书架（我的二级）' },
  { surface: 'profile_secondary', pathPrefix: '/profile/', note: '我的二级子页' },
  { surface: 'settings_web', pathPrefix: '/settings', note: '说明型设置 Web 页' },
  { surface: 'friend_group', pathPrefix: '/friend', note: '加好友等' },
  { surface: 'friend_group', pathPrefix: '/group', note: '建群等' },
] as const;

export function isH5WhitelistedPath(pathname: string): boolean {
  const path = (pathname || '/').split('?')[0] || '/';
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return H5_WHITELIST.some(
    (e) =>
      normalized === e.pathPrefix ||
      normalized.startsWith(
        e.pathPrefix.endsWith('/') ? e.pathPrefix : e.pathPrefix,
      ),
  );
}
