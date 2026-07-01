/** 经文/回顾分享图（Canvas → PNG） */
import { BRAND_NAME } from './brand';

export interface ShareCardInput {
  title: string;
  subtitle?: string;
  body: string;
  footer?: string;
}

export async function renderShareCardPng(input: ShareCardInput): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  const w = 1080;
  const h = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#f7f4ee');
  grad.addColorStop(1, '#e8e0d4');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#5b6b4f';
  ctx.font = '600 42px system-ui, -apple-system, sans-serif';
  ctx.fillText(BRAND_NAME, 72, 100);

  ctx.fillStyle = '#2c2416';
  ctx.font = '700 52px "Songti SC", "STSong", serif';
  wrapText(ctx, input.title, 72, 200, w - 144, 64);

  if (input.subtitle) {
    ctx.fillStyle = '#6b5d4f';
    ctx.font = '400 32px system-ui, sans-serif';
    ctx.fillText(input.subtitle, 72, 320);
  }

  ctx.fillStyle = '#3d3428';
  ctx.font = '400 38px "Songti SC", "STSong", serif';
  const bodyY = input.subtitle ? 400 : 340;
  wrapText(ctx, input.body, 72, bodyY, w - 144, 56);

  ctx.fillStyle = '#8a7a68';
  ctx.font = '400 28px system-ui, sans-serif';
  ctx.fillText(input.footer || '安静读经，在话语中相遇', 72, h - 80);

  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/png', 0.92);
  });
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const chars = [...text];
  let line = '';
  let cy = y;
  for (const ch of chars) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = ch;
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}

export async function shareCard(input: ShareCardInput): Promise<boolean> {
  const blob = await renderShareCardPng(input);
  if (!blob) return false;
  const file = new File([blob], 'share.png', { type: 'image/png' });
  const nav = navigator as Navigator & {
    share?: (d: { files?: File[]; text?: string }) => Promise<void>;
    canShare?: (d: { files?: File[] }) => boolean;
  };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text: input.title });
      return true;
    } catch {
      /* fallthrough */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'share.png';
  a.click();
  URL.revokeObjectURL(url);
  return true;
}
