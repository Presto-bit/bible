/** 读经回顾分享图：经文 + 足迹 + 书卷合一海报 */

import { clientWithBasePath } from './basePath';
import { BRAND_NAME, BRAND_TAGLINE } from './brand';
import { dailyVerseWallpaperUrl } from './daily_verse_wallpaper';
import { PWA_ICON_SOURCE } from './pwa_brand';
import { bookThemeDay, type WrappedStats } from './wrapped';

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

function wallpaperDayFor(w: WrappedStats): number {
  if (w.yearVerse) return bookThemeDay(w.yearVerse.ref.split('.')[0] || w.topBookId);
  if (w.topBookId) return bookThemeDay(w.topBookId);
  return w.period === 'year' ? 21 : 14;
}

async function prepCanvas(w: WrappedStats, scale = 1) {
  const width = Math.round(1080 * scale);
  const height = Math.round(1920 * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  if (scale !== 1) ctx.scale(scale, scale);

  const logicalW = 1080;
  const logicalH = 1920;
  const [wallpaper, brandIcon] = await Promise.all([
    loadImage(dailyVerseWallpaperUrl(wallpaperDayFor(w), 'full')),
    loadImage(clientWithBasePath(PWA_ICON_SOURCE)),
  ]);

  if (wallpaper) {
    drawCover(ctx, wallpaper, logicalW, logicalH);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, logicalH);
    g.addColorStop(0, '#1c332c');
    g.addColorStop(1, '#0f1c18');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, logicalW, logicalH);
  }

  const scrim = ctx.createLinearGradient(0, 0, 0, logicalH);
  scrim.addColorStop(0, 'rgba(12, 22, 18, 0.58)');
  scrim.addColorStop(0.42, 'rgba(12, 22, 18, 0.34)');
  scrim.addColorStop(1, 'rgba(12, 22, 18, 0.8)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, logicalW, logicalH);

  return { canvas, ctx, width: logicalW, height: logicalH, brandIcon };
}

function drawCombinedPoster(
  ctx: CanvasRenderingContext2D,
  w: WrappedStats,
  brandIcon: HTMLImageElement | null,
  width: number,
  height: number,
) {
  const pad = 72;
  if (brandIcon) drawRoundImage(ctx, brandIcon, pad, 88, 56);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '700 36px system-ui, -apple-system, "PingFang SC", sans-serif';
  ctx.fillText(BRAND_NAME, pad + (brandIcon ? 72 : 0), 118);
  ctx.fillStyle = 'rgba(255,255,255,0.68)';
  ctx.font = '500 26px system-ui, -apple-system, "PingFang SC", sans-serif';
  ctx.fillText(w.label, pad + (brandIcon ? 72 : 0), 158);

  let y = 260;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '600 24px system-ui, -apple-system, "PingFang SC", sans-serif';
  ctx.fillText(w.period === 'year' ? '年度回顾' : '本月回顾', pad, y);
  y += 56;

  // Hero: verse if present, else highlight
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 14;
  if (w.yearVerse?.text) {
    ctx.font = '700 48px "Noto Serif SC", "Songti SC", Georgia, serif';
    y = wrapText(ctx, `「${w.yearVerse.text}」`, pad, y, width - pad * 2, 66, 5);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.font = '500 28px system-ui, -apple-system, "PingFang SC", sans-serif';
    ctx.fillText(`— ${w.yearVerse.label}`, pad, y + 36);
    y += 88;
  } else {
    ctx.font = '700 48px "Noto Serif SC", "Songti SC", Georgia, serif';
    y = wrapText(ctx, w.highlight, pad, y, width - pad * 2, 66, 4);
    ctx.shadowBlur = 0;
    y += 48;
  }

  // Metrics
  const tiles: { value: string; label: string }[] = [
    { value: String(w.totalMinutes), label: '分钟' },
    { value: String(w.activeDays), label: '活跃天' },
    { value: String(w.streak), label: '连续天' },
  ];
  if (w.chapters > 0) tiles.push({ value: String(w.chapters), label: '章' });

  const tileW = (width - pad * 2 - 24) / 2;
  const tileH = 156;
  let tx = pad;
  let ty = y;
  tiles.slice(0, 4).forEach((t, i) => {
    if (i === 2) {
      tx = pad;
      ty += tileH + 20;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(ctx, tx, ty, tileW, tileH, 24);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 56px system-ui, -apple-system, "PingFang SC", sans-serif';
    ctx.fillText(t.value, tx + 28, ty + 72);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '500 26px system-ui, -apple-system, "PingFang SC", sans-serif';
    ctx.fillText(t.label, tx + 28, ty + 118);
    tx += tileW + 24;
  });
  y = ty + tileH + 40;

  // Book + highlight strip
  if (w.topBookName || (w.yearVerse && w.highlight)) {
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    roundRect(ctx, pad, y, width - pad * 2, w.topBookName && w.yearVerse ? 140 : 100, 24);
    ctx.fill();
    let iy = y + 44;
    if (w.topBookName) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = '600 32px "Noto Serif SC", "Songti SC", Georgia, serif';
      ctx.fillText(`常读 · 《${w.topBookName}》`, pad + 28, iy);
      iy += 44;
    }
    if (w.yearVerse) {
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.font = '500 26px system-ui, -apple-system, "PingFang SC", sans-serif';
      wrapText(ctx, w.highlight, pad + 28, iy, width - pad * 2 - 56, 36, 2);
    }
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
}

/** 9:16 合一回顾分享图 */
export async function renderWrappedSharePng(
  w: WrappedStats,
  opts?: { scale?: number },
): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;

  const scale = Math.min(1, Math.max(0.2, opts?.scale ?? 1));
  const prepared = await prepCanvas(w, scale);
  if (!prepared) return null;
  const { canvas, ctx, width, height, brandIcon } = prepared;
  drawCombinedPoster(ctx, w, brandIcon, width, height);

  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/png', scale < 1 ? 0.82 : 0.94);
  });
}
