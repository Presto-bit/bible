/** 读经回顾分享图：大数字故事风，便于朋友圈传播 */

import { clientWithBasePath } from './basePath';
import { BRAND_NAME, BRAND_TAGLINE } from './brand';
import { dailyVerseWallpaperUrl } from './daily_verse_wallpaper';
import { PWA_ICON_SOURCE } from './pwa_brand';
import type { WrappedStats } from './wrapped';

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function drawRoundImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  size: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, x, y, size, size);
  ctx.restore();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 6,
): number {
  const chars = [...text];
  let line = '';
  let cy = y;
  let lines = 0;
  for (const ch of chars) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      if (lines >= maxLines - 1) {
        ctx.fillText(`${line.replace(/.$/u, '')}…`, x, cy);
        return cy + lineHeight;
      }
      ctx.fillText(line, x, cy);
      line = ch;
      cy += lineHeight;
      lines += 1;
    } else {
      line = test;
    }
  }
  if (line) {
    ctx.fillText(line, x, cy);
    cy += lineHeight;
  }
  return cy;
}

/** 9:16 回顾分享图 */
export async function renderWrappedSharePng(w: WrappedStats): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  const width = 1080;
  const height = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const day = w.period === 'year' ? 21 : 14;
  const [wallpaper, brandIcon] = await Promise.all([
    loadImage(dailyVerseWallpaperUrl(day, 'full')),
    loadImage(clientWithBasePath(PWA_ICON_SOURCE)),
  ]);

  if (wallpaper) {
    drawCover(ctx, wallpaper, width, height);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, '#1c332c');
    g.addColorStop(1, '#0f1c18');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }

  const scrim = ctx.createLinearGradient(0, 0, 0, height);
  scrim.addColorStop(0, 'rgba(12, 22, 18, 0.55)');
  scrim.addColorStop(0.4, 'rgba(12, 22, 18, 0.35)');
  scrim.addColorStop(1, 'rgba(12, 22, 18, 0.72)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, width, height);

  const pad = 72;
  if (brandIcon) drawRoundImage(ctx, brandIcon, pad, 88, 56);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '700 36px system-ui, -apple-system, "PingFang SC", sans-serif';
  ctx.fillText(BRAND_NAME, pad + (brandIcon ? 72 : 0), 118);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '500 28px system-ui, -apple-system, "PingFang SC", sans-serif';
  ctx.fillText(w.label, pad + (brandIcon ? 72 : 0), 158);

  let y = 320;
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 56px "Noto Serif SC", "Songti SC", Georgia, serif';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 14;
  y = wrapText(ctx, w.highlight, pad, y, width - pad * 2, 74, 4);
  ctx.shadowBlur = 0;

  const tiles: { value: string; label: string }[] = [
    { value: String(w.totalMinutes), label: '分钟' },
    { value: String(w.activeDays), label: '活跃天' },
    { value: String(w.streak), label: '连续天' },
  ];
  if (w.chapters > 0) tiles.push({ value: String(w.chapters), label: '章' });

  const tileW = (width - pad * 2 - 24) / 2;
  const tileH = 180;
  let tx = pad;
  let ty = y + 48;
  tiles.slice(0, 4).forEach((t, i) => {
    if (i === 2) {
      tx = pad;
      ty += tileH + 24;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(ctx, tx, ty, tileW, tileH, 28);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 64px system-ui, -apple-system, "PingFang SC", sans-serif';
    ctx.fillText(t.value, tx + 36, ty + 88);
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = '500 28px system-ui, -apple-system, "PingFang SC", sans-serif';
    ctx.fillText(t.label, tx + 36, ty + 136);
    tx += tileW + 24;
  });

  if (w.topBookName) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '500 30px system-ui, -apple-system, "PingFang SC", sans-serif';
    ctx.fillText(`常读 · 《${w.topBookName}》`, pad, height - 220);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.font = '600 30px system-ui, -apple-system, "PingFang SC", sans-serif';
  ctx.fillText(BRAND_NAME, pad, height - 140);
  ctx.fillStyle = 'rgba(255,255,255,0.62)';
  ctx.font = '400 26px system-ui, -apple-system, "PingFang SC", sans-serif';
  ctx.fillText(BRAND_TAGLINE, pad, height - 96);
  ctx.fillStyle = 'rgba(255,255,255,0.48)';
  ctx.font = '400 24px system-ui, -apple-system, "PingFang SC", sans-serif';
  ctx.fillText('保存到主屏幕 · 下次一点就开', pad, height - 56);

  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/png', 0.94);
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
