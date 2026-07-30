/** 读经回顾分享图：经文海报 / 足迹卡 / 书卷印象 */

import { clientWithBasePath } from './basePath';
import { BRAND_NAME, BRAND_TAGLINE } from './brand';
import { dailyVerseWallpaperUrl } from './daily_verse_wallpaper';
import { PWA_ICON_SOURCE } from './pwa_brand';
import {
  bookThemeDay,
  type WrappedShareTemplate,
  type WrappedStats,
} from './wrapped';

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

function wallpaperDayFor(w: WrappedStats, template: WrappedShareTemplate): number {
  if (template === 'verse' && w.yearVerse) {
    return bookThemeDay(w.yearVerse.ref.split('.')[0] || w.topBookId);
  }
  if (template === 'book') return bookThemeDay(w.topBookId);
  return w.period === 'year' ? 21 : 14;
}

async function prepCanvas(w: WrappedStats, template: WrappedShareTemplate) {
  const width = 1080;
  const height = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const day = wallpaperDayFor(w, template);
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
  scrim.addColorStop(0, 'rgba(12, 22, 18, 0.58)');
  scrim.addColorStop(0.45, 'rgba(12, 22, 18, 0.32)');
  scrim.addColorStop(1, 'rgba(12, 22, 18, 0.78)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, width, height);

  return { canvas, ctx, width, height, brandIcon };
}

function drawBrandHeader(
  ctx: CanvasRenderingContext2D,
  brandIcon: HTMLImageElement | null,
  label: string,
  badge: string,
) {
  const pad = 72;
  if (brandIcon) drawRoundImage(ctx, brandIcon, pad, 88, 56);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '700 36px system-ui, -apple-system, "PingFang SC", sans-serif';
  ctx.fillText(BRAND_NAME, pad + (brandIcon ? 72 : 0), 118);
  ctx.fillStyle = 'rgba(255,255,255,0.68)';
  ctx.font = '500 26px system-ui, -apple-system, "PingFang SC", sans-serif';
  ctx.fillText(label, pad + (brandIcon ? 72 : 0), 158);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '600 24px system-ui, -apple-system, "PingFang SC", sans-serif';
  ctx.fillText(badge, pad, 220);
}

function drawFooter(ctx: CanvasRenderingContext2D, height: number, pad: number) {
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

function drawVerseTemplate(
  ctx: CanvasRenderingContext2D,
  w: WrappedStats,
  brandIcon: HTMLImageElement | null,
  width: number,
  height: number,
) {
  const pad = 72;
  const v = w.yearVerse!;
  drawBrandHeader(
    ctx,
    brandIcon,
    w.label,
    w.period === 'year' ? '年度经文' : '本月经文',
  );

  let y = 360;
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 54px "Noto Serif SC", "Songti SC", Georgia, serif';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 14;
  const body = v.text || w.highlight;
  y = wrapText(ctx, `「${body}」`, pad, y, width - pad * 2, 72, 8);
  ctx.shadowBlur = 0;

  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.font = '500 32px system-ui, -apple-system, "PingFang SC", sans-serif';
  ctx.fillText(`— ${v.label}`, pad, Math.min(y + 48, height - 280));

  drawFooter(ctx, height, pad);
}

function drawFootprintTemplate(
  ctx: CanvasRenderingContext2D,
  w: WrappedStats,
  brandIcon: HTMLImageElement | null,
  width: number,
  height: number,
) {
  const pad = 72;
  drawBrandHeader(ctx, brandIcon, w.label, '读经足迹');

  let y = 340;
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 52px "Noto Serif SC", "Songti SC", Georgia, serif';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 14;
  y = wrapText(ctx, w.highlight, pad, y, width - pad * 2, 70, 4);
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

  drawFooter(ctx, height, pad);
}

function drawBookTemplate(
  ctx: CanvasRenderingContext2D,
  w: WrappedStats,
  brandIcon: HTMLImageElement | null,
  width: number,
  height: number,
) {
  const pad = 72;
  drawBrandHeader(ctx, brandIcon, w.label, '书卷印象');

  let y = 420;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '500 30px system-ui, -apple-system, "PingFang SC", sans-serif';
  ctx.fillText(w.period === 'year' ? '今年常在' : '这个月常在', pad, y);
  y += 80;

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 72px "Noto Serif SC", "Songti SC", Georgia, serif';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 14;
  y = wrapText(ctx, `《${w.topBookName || '圣经'}》`, pad, y, width - pad * 2, 88, 3);
  ctx.shadowBlur = 0;

  y += 36;
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '500 34px system-ui, -apple-system, "PingFang SC", sans-serif';
  y = wrapText(
    ctx,
    w.chapters > 0 ? `留下 ${w.chapters} 章足迹 · ${w.highlight}` : w.highlight,
    pad,
    y,
    width - pad * 2,
    48,
    4,
  );

  drawFooter(ctx, height, pad);
}

/** 9:16 回顾分享图（支持模板） */
export async function renderWrappedSharePng(
  w: WrappedStats,
  template: WrappedShareTemplate = w.defaultShareTemplate,
): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;

  let t = template;
  if (t === 'verse' && !w.yearVerse) t = 'footprint';
  if (t === 'book' && !w.topBookName) t = 'footprint';

  const prepared = await prepCanvas(w, t);
  if (!prepared) return null;
  const { canvas, ctx, width, height, brandIcon } = prepared;

  if (t === 'verse') drawVerseTemplate(ctx, w, brandIcon, width, height);
  else if (t === 'book') drawBookTemplate(ctx, w, brandIcon, width, height);
  else drawFootprintTemplate(ctx, w, brandIcon, width, height);

  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/png', 0.94);
  });
}
