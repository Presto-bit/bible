/**
 * iOS PWA ↔ 安卓壳 安全区 / 视口标定矩阵（逻辑像素）。
 * 人工截图与 chrome_parity_screens.mjs 共用同一数据源。
 *
 * 注：bottom inset 在手势导航≈机型 home / 导航区；三键导航安卓可能更大。
 */

/** @typedef {{ id: string; label: string; platform: 'ios' | 'android'; width: number; height: number; dpr: number; safe: { top: number; right: number; bottom: number; left: number }; note?: string }} DeviceProfile */

/** @type {DeviceProfile[]} */
export const CHROME_DEVICE_MATRIX = [
  {
    id: 'iphone16',
    label: 'iPhone 16 / 15',
    platform: 'ios',
    width: 393,
    height: 852,
    dpr: 3,
    safe: { top: 59, right: 0, bottom: 34, left: 0 },
    note: '标准刘海+底部 home indicator；iOS PWA 金标准',
  },
  {
    id: 'iphone16-plus',
    label: 'iPhone 16 Plus / 15 Plus',
    platform: 'ios',
    width: 430,
    height: 932,
    dpr: 3,
    safe: { top: 59, right: 0, bottom: 34, left: 0 },
  },
  {
    id: 'iphone-se',
    label: 'iPhone SE (3rd)',
    platform: 'ios',
    width: 375,
    height: 667,
    dpr: 2,
    safe: { top: 20, right: 0, bottom: 0, left: 0 },
    note: '无 home indicator；校验 --tabbar-safe 不为强制 8px',
  },
  {
    id: 'pixel8',
    label: 'Pixel 8 手势导航',
    platform: 'android',
    width: 412,
    height: 915,
    dpr: 2.625,
    safe: { top: 40, right: 0, bottom: 24, left: 0 },
    note: '壳注入 --shell-inset-* 对标；真机以 WindowInsets 为准',
  },
  {
    id: 'xiaomi-gesture',
    label: '小米主流 手势',
    platform: 'android',
    width: 393,
    height: 873,
    dpr: 2.75,
    safe: { top: 36, right: 0, bottom: 20, left: 0 },
  },
  {
    id: 'android-3btn',
    label: '安卓三键导航（典型）',
    platform: 'android',
    width: 412,
    height: 892,
    dpr: 2.625,
    safe: { top: 40, right: 0, bottom: 48, left: 0 },
    note: '底 inset 更大；Tab 不得被导航条挡住',
  },
];

/** 须在两端一致的关键 token（静态校验 globals.css） */
export const CHROME_TOKEN_ASSERTIONS = {
  tabbarSafeFormula: '--tabbar-safe: var(--safe-bottom)',
  forbiddenShellOnly: [
    /html\.android-shell\s*\{[^}]*--tabbar-safe/s,
    /html\.android-shell[^{]*\{[^}]*font-weight:\s*700/s,
    /html\.android-shell[^,{]*\.tabbar[^}]*96%/s,
    /html\.android-shell[^{]*home-today-primary[^{]*\{[^}]*min-height:\s*176px/s,
  ],
  fabBottomHasNoDoubleSafe: [
    // 允许 tabbar-h + 8px；禁止叠 safe-bottom
    {
      fileHints: ['globals.css', 'reader.css'],
      bad: /reader-fab-stack[^{]*\{[^}]*max\(8px,\s*var\(--safe-bottom\)\)/s,
    },
  ],
};

/** 截图验收页（人工 / 自动化） */
export const CHROME_SCREEN_ROUTES = [
  { id: 'home', path: '/', title: '首页' },
  { id: 'reader', path: '/reader', title: '圣经' },
  { id: 'assistant', path: '/assistant', title: '小爱' },
  { id: 'discover', path: '/discover', title: '发现' },
  { id: 'profile', path: '/profile', title: '我的' },
];
