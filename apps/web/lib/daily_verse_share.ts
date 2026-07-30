/** 每日经文分享：文字+链 + 经文卡图（贴近首页 Hero 卡） */
import { analysisShareSiteOrigin } from './analysis_share';
import { clientWithBasePath, withBasePath } from './basePath';
import { BRAND_NAME, BRAND_TAGLINE } from './brand';
import { formatDailyVerseQuote } from './daily_verse_display';
import { dailyVerseWallpaperUrl } from './daily_verse_wallpaper';
import { PWA_ICON_SOURCE } from './pwa_brand';
import { shareOutbound } from './share_outbound';

export type DailyVerseShareInput = {
  ref: string;
  text: string;
  day?: number;
  versionLabel?: string;
};

export type DailyVerseShareResult = 'shared' | 'cancelled' | 'downloaded' | 'copied' | 'failed';

const SHARE_INSTALL_CTA = `打开链接，把${BRAND_NAME}保存到主屏幕`;

export function buildDailyVerseShareText(input: DailyVerseShareInput): string {
  const quote = (input.text || '').trim();
  const ref = (input.ref || '').trim();
  const ver = input.versionLabel?.trim();
  const lines = [
    quote ? `「${quote}」` : '',
    ref ? `—— ${ref}${ver ? ` · ${ver}` : ''}` : '',
    '',
    `${BRAND_NAME} · 每日经文`,
    BRAND_TAGLINE,
    SHARE_INSTALL_CTA,
  ].filter((line, i, arr) => !(line === '' && arr[i - 1] === ''));
  return lines.join('\n');
}

/** 分享落地页：展示经文 + 提醒安装到桌面 */
export function dailyVerseShareUrl(day?: number): string {
  const origin = analysisShareSiteOrigin();
  const path =
    typeof window === 'undefined'
      ? withBasePath('/share/daily-verse')
      : clientWithBasePath('/share/daily-verse');
  const u = new URL(path, origin.endsWith('/') ? origin : `${origin}/`);
  if (day != null && Number.isFinite(day)) u.searchParams.set('day', String(day));
  u.searchParams.set('ch1', 'share');
  u.searchParams.set('ch2', 'daily_verse');
  return u.toString();
}

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
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
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
        const clipped = `${line.replace(/.$/u, '')}…`;
        ctx.fillText(clipped, x, cy);
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

function drawFallbackScene(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#ffecd9');
  grad.addColorStop(0.45, '#f7ebe0');
  grad.addColorStop(1, '#d9c5ae');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const glowA = ctx.createRadialGradient(w * 0.86, h * 0.16, 20, w * 0.86, h * 0.16, w * 0.45);
  glowA.addColorStop(0, 'rgba(255, 200, 140, 0.55)');
  glowA.addColorStop(1, 'rgba(255, 200, 140, 0)');
  ctx.fillStyle = glowA;
  ctx.fillRect(0, 0, w, h);

  const glowB = ctx.createRadialGradient(w * 0.12, h * 0.88, 10, w * 0.12, h * 0.88, w * 0.38);
  glowB.addColorStop(0, 'rgba(232, 160, 144, 0.28)');
  glowB.addColorStop(1, 'rgba(232, 160, 144, 0)');
  ctx.fillStyle = glowB;
  ctx.fillRect(0, 0, w, h);
}

function drawArtScrim(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const scrim = ctx.createLinearGradient(0, 0, 0, h);
  scrim.addColorStop(0, 'rgba(20, 24, 28, 0.42)');
  scrim.addColorStop(0.48, 'rgba(20, 24, 28, 0.28)');
  scrim.addColorStop(1, 'rgba(20, 24, 28, 0.55)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, w, h);
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

/** 生成贴近首页每日经文卡的分享图（含品牌标识）。 */
export async function renderDailyVerseSharePng(
  input: DailyVerseShareInput,
): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;

  const w = 1080;
  const h = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const padX = 72;
  const wallpaperSrc = dailyVerseWallpaperUrl(input.day, 'full');
  const [wallpaper, brandIcon] = await Promise.all([
    loadImage(wallpaperSrc),
    loadImage(clientWithBasePath(PWA_ICON_SOURCE)),
  ]);
  if (wallpaper) {
    drawCover(ctx, wallpaper, w, h);
    drawArtScrim(ctx, w, h);
  } else {
    drawFallbackScene(ctx, w, h);
    drawArtScrim(ctx, w, h);
  }

  const iconSize = 56;
  if (brandIcon) {
    drawRoundImage(ctx, brandIcon, padX, 78, iconSize);
  }
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.font = '700 34px system-ui, -apple-system, "PingFang SC", "Noto Sans SC", sans-serif';
  ctx.fillText(BRAND_NAME, padX + (brandIcon ? iconSize + 16 : 0), 104);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.font = '500 26px system-ui, -apple-system, "PingFang SC", "Noto Sans SC", sans-serif';
  ctx.fillText('每日经文', padX + (brandIcon ? iconSize + 16 : 0), 140);

  const quote = formatDailyVerseQuote(input.text || '');
  const ref = (input.ref || '').trim();
  const ver = input.versionLabel?.trim();

  let y = Math.floor(h * 0.42);
  if (ref) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.font = '600 36px system-ui, -apple-system, "PingFang SC", "Noto Sans SC", sans-serif';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    ctx.fillText(ref, padX, y);
    y += 56;
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = '400 48px "Noto Serif SC", "Songti SC", "Source Han Serif SC", Georgia, serif';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 2;
  y = wrapText(ctx, quote, padX, y + 8, w - padX * 2, 68, 9);

  if (ver) {
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.font = '400 28px system-ui, -apple-system, "PingFang SC", sans-serif';
    ctx.fillText(ver, padX, Math.min(y + 28, h - 180));
  }

  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
  ctx.font = '600 30px system-ui, -apple-system, "PingFang SC", sans-serif';
  ctx.fillText(BRAND_NAME, padX, h - 120);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
  ctx.font = '400 24px system-ui, -apple-system, "PingFang SC", sans-serif';
  ctx.fillText(BRAND_TAGLINE, padX, h - 80);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.font = '400 22px system-ui, -apple-system, "PingFang SC", sans-serif';
  ctx.fillText('保存到主屏幕 · 下次一点就开', padX, h - 44);

  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/png', 0.94);
  });
}

/**
 * 调起系统分享（优先经文卡图 + 文案）。
 * 用户取消 → cancelled（不下图）；无 Share API 才下载卡片。
 */
export async function shareDailyVerseCard(
  input: DailyVerseShareInput,
): Promise<DailyVerseShareResult> {
  const title = `${(input.ref || '每日经文').trim()}｜${BRAND_NAME}`;
  const body = (input.text || '').trim();
  if (!body) return 'failed';

  const blob = await renderDailyVerseSharePng(input);
  if (!blob) return 'failed';

  const file = new File([blob], 'daily-verse-share.png', { type: 'image/png' });
  const text = buildDailyVerseShareText(input);
  const shareUrl = dailyVerseShareUrl(input.day);

  return shareOutbound({
    title,
    text,
    url: shareUrl,
    file,
    // 每日经文：无系统分享时仍可下载卡图（保留原能力）；有分享时取消绝不下载
    allowDownload: true,
  }).then((result) => {
    if (result === 'shared' || result === 'copied' || result === 'downloaded') {
      void import('./product_events').then((m) =>
        m.trackProductEvent('share_out', {
          props: { surface: 'daily_verse', result },
        }),
      );
    }
    return result;
  });
}
