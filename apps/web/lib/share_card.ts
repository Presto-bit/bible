/** 出站分享图：氛围风（对齐每日经文卡），系统分享契约见 share_outbound */
import { clientWithBasePath } from './basePath';
import { BRAND_NAME, BRAND_TAGLINE } from './brand';
import { dailyVerseWallpaperUrl } from './daily_verse_wallpaper';
import { PWA_ICON_SOURCE } from './pwa_brand';
import {
  shareOutbound,
  type ShareOutboundResult,
} from './share_outbound';

export interface ShareCardInput {
  title: string;
  subtitle?: string;
  body: string;
  footer?: string;
  /** 壁纸 day，默认 1 */
  day?: number;
  /** 角标，如「小爱解读」「产品邀请」 */
  badge?: string;
}

function loadImage(src: string, timeoutMs = 1200): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const done = (value: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    img.decoding = 'async';
    img.onload = () => done(img);
    img.onerror = () => done(null);
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

function drawFallback(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#ffecd9');
  grad.addColorStop(0.45, '#f7ebe0');
  grad.addColorStop(1, '#d9c5ae');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function drawScrim(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const scrim = ctx.createLinearGradient(0, 0, 0, h);
  scrim.addColorStop(0, 'rgba(20, 24, 28, 0.42)');
  scrim.addColorStop(0.48, 'rgba(20, 24, 28, 0.28)');
  scrim.addColorStop(1, 'rgba(20, 24, 28, 0.58)');
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

/** 氛围风分享卡（壁纸 + 暗 scrim + 白字），与每日经文卡同一语言 */
export async function renderShareCardPng(input: ShareCardInput): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  const w = 1080;
  const h = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const padX = 72;
  const [wallpaper, brandIcon] = await Promise.all([
    loadImage(dailyVerseWallpaperUrl(input.day ?? 1, 'full')),
    loadImage(clientWithBasePath(PWA_ICON_SOURCE)),
  ]);
  if (wallpaper) {
    drawCover(ctx, wallpaper, w, h);
  } else {
    drawFallback(ctx, w, h);
  }
  drawScrim(ctx, w, h);

  const iconSize = 56;
  if (brandIcon) {
    drawRoundImage(ctx, brandIcon, padX, 78, iconSize);
  }
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.font = '700 34px system-ui, -apple-system, "PingFang SC", "Noto Sans SC", sans-serif';
  ctx.fillText(BRAND_NAME, padX + (brandIcon ? iconSize + 16 : 0), 104);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.font = '500 26px system-ui, -apple-system, "PingFang SC", "Noto Sans SC", sans-serif';
  ctx.fillText(input.badge || '分享', padX + (brandIcon ? iconSize + 16 : 0), 140);

  let y = Math.floor(h * 0.36);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 48px "Noto Serif SC", "Songti SC", "Source Han Serif SC", Georgia, serif';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 2;
  y = wrapText(ctx, input.title, padX, y, w - padX * 2, 64, 3);

  if (input.subtitle) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
    ctx.font = '500 30px system-ui, -apple-system, "PingFang SC", sans-serif';
    y = wrapText(ctx, input.subtitle, padX, y + 16, w - padX * 2, 42, 2);
  }

  ctx.shadowBlur = 8;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
  ctx.font = '400 36px "Noto Serif SC", "Songti SC", Georgia, serif';
  wrapText(ctx, input.body, padX, y + 28, w - padX * 2, 52, 8);

  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
  ctx.font = '600 28px system-ui, -apple-system, "PingFang SC", sans-serif';
  ctx.fillText(BRAND_NAME, padX, h - 120);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
  ctx.font = '400 24px system-ui, -apple-system, "PingFang SC", sans-serif';
  ctx.fillText(input.footer || BRAND_TAGLINE, padX, h - 80);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.font = '400 22px system-ui, -apple-system, "PingFang SC", sans-serif';
  ctx.fillText('保存到主屏幕 · 下次一点就开', padX, h - 44);

  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/png', 0.94);
  });
}

export type ShareCardOutboundInput = ShareCardInput & {
  /** 系统分享 title */
  shareTitle?: string;
  /** 系统分享正文（不含 URL） */
  shareText: string;
  /** 落地链接 */
  shareUrl: string;
  /** 无 Share API 时是否允许下载图；出站默认 false（只复制） */
  allowDownload?: boolean;
};

/** 出站分享卡：优先系统分享，取消不下图，失败只复制文+链 */
export async function shareCardOutbound(
  input: ShareCardOutboundInput,
): Promise<ShareOutboundResult> {
  const blob = await renderShareCardPng(input);
  const file = blob
    ? new File([blob], 'share.png', { type: 'image/png' })
    : null;
  return shareOutbound({
    title: input.shareTitle || input.title,
    text: input.shareText,
    url: input.shareUrl,
    file,
    allowDownload: input.allowDownload ?? false,
  });
}

/**
 * @deprecated 请优先用 shareCardOutbound；保留给仍只需 boolean 的调用方。
 * 取消返回 false；成功分享/复制/下载返回 true。
 */
export async function shareCard(input: ShareCardInput): Promise<boolean> {
  const blob = await renderShareCardPng(input);
  if (!blob) return false;
  const file = new File([blob], 'share.png', { type: 'image/png' });
  const result = await shareOutbound({
    title: input.title,
    text: [input.subtitle, input.body].filter(Boolean).join('\n'),
    url: '',
    file,
    allowDownload: true,
  });
  return result === 'shared' || result === 'copied' || result === 'downloaded';
}
