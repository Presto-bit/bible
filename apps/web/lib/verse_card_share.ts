/** 金句海报卡：复用每日经文风景壁纸与出图管线。 */

import { clientWithBasePath } from './basePath';
import { BRAND_NAME } from './brand';
import {
  DAILY_WALLPAPER_FILES,
  dailyVerseWallpaperUrl,
  systemCoverOptions,
} from './daily_verse_wallpaper';
import { PWA_ICON_SOURCE } from './pwa_brand';
import { shareOutbound } from './share_outbound';

export type VerseCardInput = {
  refLabel: string;
  text: string;
  /** 0-based wallpaper index into DAILY_WALLPAPER_FILES */
  wallpaperIndex?: number;
  note?: string;
  versionLabel?: string;
};

export type VerseCardShareResult = 'shared' | 'cancelled' | 'downloaded' | 'failed';

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

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 10,
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

export function wallpaperIndexCount(): number {
  return DAILY_WALLPAPER_FILES.length;
}

export function wallpaperPreviewUrl(index: number): string {
  const i = ((index % DAILY_WALLPAPER_FILES.length) + DAILY_WALLPAPER_FILES.length)
    % DAILY_WALLPAPER_FILES.length;
  const opt = systemCoverOptions()[i];
  return opt?.url ?? dailyVerseWallpaperUrl(i + 1, 'card');
}

export async function renderVerseCardPng(input: VerseCardInput): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  const w = 1080;
  const h = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const idx = Math.max(0, input.wallpaperIndex ?? 0) % DAILY_WALLPAPER_FILES.length;
  const wallpaperSrc = wallpaperPreviewUrl(idx);
  const [wallpaper, brandIcon] = await Promise.all([
    loadImage(wallpaperSrc),
    loadImage(clientWithBasePath(PWA_ICON_SOURCE)),
  ]);

  if (wallpaper) {
    drawCover(ctx, wallpaper, w, h);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2a3340');
    g.addColorStop(1, '#1a1f26');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  const scrim = ctx.createLinearGradient(0, 0, 0, h);
  scrim.addColorStop(0, 'rgba(20,24,28,0.45)');
  scrim.addColorStop(0.5, 'rgba(20,24,28,0.28)');
  scrim.addColorStop(1, 'rgba(20,24,28,0.58)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, w, h);

  const padX = 72;
  if (brandIcon) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(padX + 28, 106, 28, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(brandIcon, padX, 78, 56, 56);
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '700 34px system-ui, -apple-system, "PingFang SC", sans-serif';
  ctx.fillText(BRAND_NAME, padX + (brandIcon ? 72 : 0), 104);
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = '500 26px system-ui, -apple-system, "PingFang SC", sans-serif';
  ctx.fillText('金句', padX + (brandIcon ? 72 : 0), 140);

  let y = Math.floor(h * 0.4);
  const ref = (input.refLabel || '').trim();
  if (ref) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '600 36px system-ui, -apple-system, "PingFang SC", sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 10;
    ctx.fillText(ref, padX, y);
    y += 56;
  }

  let quote = (input.text || '').trim();
  if (quote.length > 160) quote = `${quote.slice(0, 159)}…`;
  ctx.fillStyle = '#fff';
  ctx.font = '400 46px "Noto Serif SC", "Songti SC", Georgia, serif';
  ctx.shadowBlur = 12;
  y = wrapText(ctx, quote, padX, y + 8, w - padX * 2, 66, 9);

  const note = (input.note || '').trim();
  if (note) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.font = '400 28px system-ui, -apple-system, "PingFang SC", sans-serif';
    y = wrapText(ctx, note, padX, Math.min(y + 24, h - 200), w - padX * 2, 40, 2);
  }

  if (input.versionLabel) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = '400 26px system-ui, -apple-system, "PingFang SC", sans-serif';
    ctx.fillText(input.versionLabel, padX, Math.min(y + 36, h - 120));
  }

  ctx.shadowBlur = 0;
  return await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/png');
  });
}

export async function shareVerseCard(input: VerseCardInput): Promise<VerseCardShareResult> {
  const blob = await renderVerseCardPng(input);
  if (!blob) return 'failed';
  const file = new File([blob], 'verse-card.png', { type: 'image/png' });
  const text = [`「${(input.text || '').trim()}」`, input.refLabel, BRAND_NAME]
    .filter(Boolean)
    .join('\n');
  const result = await shareOutbound({
    title: input.refLabel || BRAND_NAME,
    text,
    url: '',
    file,
    allowDownload: true,
  });
  if (result === 'shared' || result === 'downloaded') return result;
  if (result === 'cancelled') return 'cancelled';
  if (result === 'copied') return 'downloaded';
  return 'failed';
}
