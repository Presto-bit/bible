/**
 * 可选截图：按设备矩阵 + 路由生成快照目录（需安装 playwright）。
 *
 * 用法：
 *   BASE_URL=http://127.0.0.1:3000 node scripts/chrome_parity_screens.mjs
 *   npx playwright install chromium   # 首次
 *
 * 输出：apps/web/.chrome-parity/<deviceId>/<routeId>.png
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHROME_DEVICE_MATRIX,
  CHROME_SCREEN_ROUTES,
} from './chrome_device_matrix.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const outRoot = join(__dir, '..', '.chrome-parity');
const baseUrl = (process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

async function main() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error(
      '未安装 playwright。可执行：\n  cd apps/web && npm i -D playwright && npx playwright install chromium',
    );
    console.error('静态校验仍可：npm run test:chrome-parity');
    process.exit(2);
  }

  mkdirSync(outRoot, { recursive: true });
  const manifest = { baseUrl, generatedAt: new Date().toISOString(), shots: [] };

  for (const device of CHROME_DEVICE_MATRIX) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: device.width, height: device.height },
      deviceScaleFactor: Math.min(device.dpr, 3),
      userAgent:
        device.platform === 'android'
          ? `Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36 PeiaiAndroidShell/parity`
          : `Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1`,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();

    // 注入 standalone + 安全区（对标壳 --shell-inset / iOS env）
    await page.addInitScript((safe, platform) => {
      const root = document.documentElement;
      root.classList.add('pwa-standalone');
      if (platform === 'android') root.classList.add('android-shell');
      root.style.setProperty('--shell-inset-top', `${safe.top}px`);
      root.style.setProperty('--shell-inset-right', `${safe.right}px`);
      root.style.setProperty('--shell-inset-bottom', `${safe.bottom}px`);
      root.style.setProperty('--shell-inset-left', `${safe.left}px`);
      // 伪装 display-mode（部分逻辑读 matchMedia）
      try {
        const orig = window.matchMedia.bind(window);
        window.matchMedia = (q) => {
          if (String(q).includes('display-mode')) {
            return {
              matches: true,
              media: q,
              addEventListener() {},
              removeEventListener() {},
              addListener() {},
              removeListener() {},
              onchange: null,
              dispatchEvent: () => false,
            };
          }
          return orig(q);
        };
      } catch {
        /* ignore */
      }
    }, device.safe, device.platform);

    const deviceDir = join(outRoot, device.id);
    mkdirSync(deviceDir, { recursive: true });

    for (const route of CHROME_SCREEN_ROUTES) {
      const url = `${baseUrl}${route.path}`;
      const file = join(deviceDir, `${route.id}.png`);
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 });
        await page.waitForTimeout(600);
        await page.screenshot({ path: file, fullPage: false });
        console.log(`✓ ${device.id} ${route.id} → ${file}`);
        manifest.shots.push({
          device: device.id,
          route: route.id,
          file,
          ok: true,
        });
      } catch (e) {
        console.error(`✖ ${device.id} ${route.id}: ${e?.message || e}`);
        manifest.shots.push({
          device: device.id,
          route: route.id,
          ok: false,
          error: String(e?.message || e),
        });
      }
    }

    await browser.close();
  }

  const manPath = join(outRoot, 'manifest.json');
  writeFileSync(manPath, JSON.stringify(manifest, null, 2));
  console.log(`\nmanifest → ${manPath}`);
  console.log(
    '对比提示：同一 route 下 ios 与 android 设备截图，关注底栏/顶安全区/字重；≤2px 机型差可接受。',
  );

  const fails = manifest.shots.filter((s) => !s.ok).length;
  process.exit(fails > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
