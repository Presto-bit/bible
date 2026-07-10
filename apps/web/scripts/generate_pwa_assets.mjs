#!/usr/bin/env node
/**
 * 从仓库根目录 icon.png 生成 PWA 图标与 iOS 启动图（系统级开屏，非 App 内 Tab 切换）。
 * 用法：cd apps/web && npm run generate-pwa
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REPO_ROOT = join(ROOT, '../..');
const PUBLIC = join(ROOT, 'public');
/** 主视觉源：仓库根 icon.png */
const ICON_PNG = join(REPO_ROOT, 'icon.png');

/** 与 icon.png 背景一致 */
const PWA_BG = '#E32626';
const PWA_INK = '#FFFFFF';
const PWA_INK_SOFT = 'rgba(255,255,255,0.85)';
const HOME_NAME = '彼爱';
const HOME_SUBTITLE = '安静读经';

const ICON_SIZES = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'icon-1024.png', size: 1024 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'apple-touch-icon-167.png', size: 167 },
];

const MASKABLE_SIZE = 512;
const MASKABLE_INNER = Math.round(MASKABLE_SIZE * 0.72);

const SPLASH_DEVICES = [
  { file: 'splash-iphone16.png', w: 393, h: 852, dpr: 3 },
  { file: 'splash-iphone16plus.png', w: 430, h: 932, dpr: 3 },
  { file: 'splash-iphone14.png', w: 390, h: 844, dpr: 3 },
  { file: 'splash-iphone11.png', w: 414, h: 896, dpr: 3 },
  { file: 'splash-iphone8.png', w: 414, h: 736, dpr: 3 },
  { file: 'splash-iphonese.png', w: 375, h: 667, dpr: 2 },
];

function iconBuffer(size) {
  return sharp(ICON_PNG).resize(size, size, { fit: 'contain', background: PWA_BG }).png();
}

async function writeMaskable() {
  const inner = await iconBuffer(MASKABLE_INNER);
  const out = join(PUBLIC, 'icon-maskable-512.png');
  await sharp({
    create: {
      width: MASKABLE_SIZE,
      height: MASKABLE_SIZE,
      channels: 4,
      background: PWA_BG,
    },
  })
    .composite([{ input: await inner.toBuffer(), gravity: 'centre' }])
    .png()
    .toFile(out);
  console.log('  icon-maskable-512.png');
}

function splashTextSvg(w, h, iconSize) {
  const cx = w / 2;
  const iconBottom = h * 0.4 + iconSize / 2;
  const titleY = iconBottom + h * 0.055;
  const subY = titleY + h * 0.042;
  const titleSize = Math.round(w * 0.1);
  const subSize = Math.round(w * 0.048);
  return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${w}" height="${h}" fill="${PWA_BG}"/>
  <text x="${cx}" y="${titleY}" text-anchor="middle" font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif" font-size="${titleSize}" font-weight="600" fill="${PWA_INK}">${HOME_NAME}</text>
  <text x="${cx}" y="${subY}" text-anchor="middle" font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif" font-size="${subSize}" fill="${PWA_INK_SOFT}">${HOME_SUBTITLE}</text>
</svg>`);
}

async function writeSplash({ file, w, h, dpr }) {
  const W = w * dpr;
  const H = h * dpr;
  const iconSize = Math.round(W * 0.32);
  const iconY = Math.round(H * 0.4 - iconSize / 2);

  const icon = await iconBuffer(iconSize);
  const textLayer = splashTextSvg(W, H, iconSize);

  const out = join(PUBLIC, file);
  await sharp(textLayer)
    .composite([{ input: await icon.toBuffer(), top: iconY, left: Math.round((W - iconSize) / 2) }])
    .png()
    .toFile(out);
  console.log(`  ${file} (${W}×${H})`);
}

async function main() {
  mkdirSync(PUBLIC, { recursive: true });
  console.log(`Generating PWA icons from ${ICON_PNG}…`);
  for (const { name, size } of ICON_SIZES) {
    await iconBuffer(size).toFile(join(PUBLIC, name));
    console.log(`  ${name}`);
  }
  await writeMaskable();

  console.log('Generating iOS startup splash screens…');
  for (const spec of SPLASH_DEVICES) {
    await writeSplash(spec);
  }

  await sharp(join(PUBLIC, 'splash-iphone16plus.png')).toFile(join(PUBLIC, 'splash-ios.png'));
  console.log('  splash-ios.png (legacy alias)');
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
