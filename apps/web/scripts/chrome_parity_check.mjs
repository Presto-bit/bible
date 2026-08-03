/**
 * P2 静态校验：壳与 iOS PWA chrome 不得再分叉。
 * 用法：node scripts/chrome_parity_check.mjs
 * 退出码 0 = 通过；非 0 = 失败
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHROME_DEVICE_MATRIX,
  CHROME_TOKEN_ASSERTIONS,
  CHROME_SCREEN_ROUTES,
} from './chrome_device_matrix.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dir, '..');

const CSS_GLOBS = [
  'app/globals.css',
  'styles/reader.css',
  'styles/profile.css',
  'styles/shared_chrome.css',
  'styles/design_tokens.css',
];

let failed = 0;

function fail(msg) {
  console.error(`✖ ${msg}`);
  failed += 1;
}

function ok(msg) {
  console.log(`✓ ${msg}`);
}

function readCss(rel) {
  const p = join(webRoot, rel);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8');
}

const allCss = CSS_GLOBS.map((r) => ({ rel: r, text: readCss(r) })).filter((x) => x.text != null);
const joined = allCss.map((x) => x.text).join('\n');

// 1) token：tabbar-safe 公式
if (joined.includes(CHROME_TOKEN_ASSERTIONS.tabbarSafeFormula)) {
  ok(`token 含 ${CHROME_TOKEN_ASSERTIONS.tabbarSafeFormula}`);
} else {
  fail(`缺少 ${CHROME_TOKEN_ASSERTIONS.tabbarSafeFormula}`);
}

// 2) 禁止 shell 专属像素分叉（布局级）
for (const re of CHROME_TOKEN_ASSERTIONS.forbiddenShellOnly) {
  if (re.test(joined)) {
    fail(`仍存在 shell 专属布局规则: ${re}`);
  } else {
    ok(`无禁止规则匹配: ${re.source.slice(0, 48)}…`);
  }
}

// 3) 选择器层级：html.android-shell 不应再驱动视觉
const androidShellRules = joined.match(/html\.android-shell|body\.android-shell/g) || [];
const commentOnlyHints = (joined.match(/android-shell/g) || []).length;
if (androidShellRules.length > 0) {
  fail(
    `CSS 仍含 html/body.android-shell 选择器 ${androidShellRules.length} 处（应仅注释或 JS 标识）`,
  );
} else {
  ok(`CSS 选择器不再使用 .android-shell（注释提及 ${commentOnlyHints} 次可接受）`);
}

// 4) FAB 不双算 safe
for (const rule of CHROME_TOKEN_ASSERTIONS.fabBottomHasNoDoubleSafe) {
  if (rule.bad.test(joined)) {
    fail('reader-fab 仍用 max(8px, safe-bottom) 与 tabbar-h 双算');
  } else {
    ok('reader-fab 未双算 safe-bottom');
  }
}

// 5) 字体 token（design_tokens / globals）
if (/--font-ui:/.test(joined) && /--font-reader:/.test(joined)) {
  ok('存在 --font-ui / --font-reader token');
} else {
  fail('应定义 --font-ui 与 --font-reader（design_tokens 或 globals）');
}
if (/var\(--font-ui\)/.test(joined) || /var\(--font-peiai-sans\)/.test(joined)) {
  ok('UI 字体栈接入 peiai / font-ui token');
} else {
  fail('body 字体栈未接入自托管 token');
}
if (/var\(--font-reader\)/.test(joined) || /var\(--font-peiai-serif\)/.test(joined)) {
  ok('读经字体栈接入 font-reader token');
} else {
  fail('读经页字体栈未接入 --font-reader');
}

// 6) 打印设备矩阵（供人工截图对照）
console.log('\n── 设备安全区矩阵（逻辑 px）──');
console.table(
  CHROME_DEVICE_MATRIX.map((d) => ({
    id: d.id,
    platform: d.platform,
    viewport: `${d.width}×${d.height}@${d.dpr}`,
    safe: `${d.safe.top}/${d.safe.right}/${d.safe.bottom}/${d.safe.left}`,
    note: d.note || '',
  })),
);

console.log('\n── 建议截图路由 ──');
for (const r of CHROME_SCREEN_ROUTES) {
  console.log(`  · ${r.title.padEnd(6)} ${r.path}`);
}

console.log(
  `\n人工对照：同主题下 iOS PWA vs 安卓壳，底栏贴底距 / 选中字重 / 读经 FAB；允许 ≤2px 机型差。`,
);

if (failed > 0) {
  console.error(`\nchrome_parity_check: ${failed} failed`);
  process.exit(1);
}
console.log('\nchrome_parity_check: all passed');
