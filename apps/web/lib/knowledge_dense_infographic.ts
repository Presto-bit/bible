/** §19.14.15 密图 · journey_spine 竖版 1080×1920（字在图内） */

import { clientWithBasePath } from './basePath';
import { BRAND_NAME, BRAND_TAGLINE } from './brand';
import { shareOutbound, type ShareOutboundResult } from './share_outbound';
import { toCanonicalShareUrl } from './share_site';
import { formatGroupRefLabel } from './ref_label';
import {
  knowledgeKindLabel,
  knowledgeRelatedHref,
  type KnowledgeRelatedKind,
} from './knowledge_story';

export const DENSE_W = 1080;
export const DENSE_H = 1920;

export type DenseBeat = {
  order: number;
  label: string;
  happen?: string;
  link?: string;
  ref?: string;
  vignette?: string | null;
};

export type DenseInfographicInput = {
  kind: KnowledgeRelatedKind;
  id: string;
  title: string;
  guide?: string;
  /** 出处条，如「使徒行传 13–14」 */
  refSpan?: string;
  arcNames?: string[];
  beats: DenseBeat[];
};

function loadImage(src: string, timeoutMs = 4000): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const done = (v: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => done(img);
    img.onerror = () => done(null);
    img.src = src;
  });
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const chars = [...(text || '').trim()];
  if (!chars.length) return [];
  const lines: string[] = [];
  let line = '';
  for (const ch of chars) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = ch;
      if (lines.length >= maxLines) {
        const last = lines[lines.length - 1];
        lines[lines.length - 1] = `${last.replace(/.$/u, '')}…`;
        return lines;
      }
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

function resolveUrl(url?: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
  return clientWithBasePath(url.startsWith('/') ? url : `/${url}`);
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

/** 渲染密图：标题/弧/站序/happen/link/出处全在图内 */
export async function renderDenseInfographicPng(
  input: DenseInfographicInput,
): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  const W = DENSE_W;
  const H = DENSE_H;
  const pad = 44;
  const beats = (input.beats || []).slice(0, 10);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#f7f3ec';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#785035';
  ctx.fillRect(0, 0, W, 6);

  // 右上角圆形「彼爱手稿」印章（每张密图统一）
  const sealR = 40;
  const sealCx = W - pad - sealR;
  const sealCy = pad + sealR + 4;
  ctx.save();
  ctx.translate(sealCx, sealCy);
  ctx.rotate((8 * Math.PI) / 180);
  ctx.beginPath();
  ctx.arc(0, 0, sealR, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,248,232,0.94)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#a65a3a';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, sealR - 6, 0, Math.PI * 2);
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#a65a3a';
  ctx.textAlign = 'center';
  ctx.font = '800 16px "PingFang SC", "Noto Sans SC", system-ui, sans-serif';
  ctx.fillText('彼爱', 0, -4);
  ctx.font = '700 13px "PingFang SC", "Noto Sans SC", system-ui, sans-serif';
  ctx.fillText('手稿', 0, 16);
  ctx.restore();
  ctx.textAlign = 'left';

  let y = 52;

  ctx.fillStyle = '#2c2825';
  ctx.font = '600 44px "PingFang SC", "Noto Sans SC", system-ui, sans-serif';
  for (const ln of wrapLines(ctx, input.title, W - pad * 2 - 96, 2)) {
    ctx.fillText(ln, pad, y);
    y += 52;
  }
  y += 4;

  const refSpan =
    input.refSpan ||
    (() => {
      const a = formatGroupRefLabel(beats[0]?.ref);
      const b = formatGroupRefLabel(beats[beats.length - 1]?.ref);
      if (a && b && a !== b) return `${a} – ${b}`;
      return a || '经文结构';
    })();
  ctx.fillStyle = '#6e675f';
  ctx.font = '400 22px "PingFang SC", system-ui, sans-serif';
  ctx.fillText(refSpan, pad, y);
  y += 36;

  if (input.guide) {
    ctx.fillStyle = '#3a3632';
    ctx.font = '400 26px "PingFang SC", system-ui, sans-serif';
    for (const ln of wrapLines(ctx, input.guide, W - pad * 2, 3)) {
      ctx.fillText(ln, pad, y);
      y += 34;
    }
  }
  y += 14;

  if (input.arcNames?.length) {
    let ax = pad;
    ctx.font = '500 20px "PingFang SC", system-ui, sans-serif';
    for (const name of input.arcNames) {
      const tw = ctx.measureText(name).width;
      const bw = tw + 24;
      roundRect(ctx, ax, y - 22, bw, 36, 8);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = '#e5ddd0';
      ctx.stroke();
      ctx.fillStyle = '#5b6b4f';
      ctx.fillText(name, ax + 12, y + 2);
      ax += bw + 12;
    }
    y += 36;
  }

  y += 18;
  ctx.fillStyle = '#785035';
  ctx.font = '600 22px "PingFang SC", system-ui, sans-serif';
  ctx.fillText(`故事脊 · ${beats.length}站`, pad, y);
  y += 16;

  const footerH = 70;
  const avail = H - footerH - y - 8;
  const rowH = Math.min(188, Math.max(148, Math.floor(avail / Math.max(beats.length, 1))));

  const thumbs = await Promise.all(
    beats.map((b) => {
      const u = resolveUrl(b.vignette);
      return u ? loadImage(u) : Promise.resolve(null);
    }),
  );

  for (let i = 0; i < beats.length; i++) {
    const b = beats[i];
    const thumb = thumbs[i];

    roundRect(ctx, pad - 8, y, W - pad * 2 + 16, rowH - 8, 12);
    ctx.fillStyle = '#fffcf7';
    ctx.fill();
    ctx.strokeStyle = '#e8dfd2';
    ctx.stroke();

    const cx = pad + 22;
    const cy = y + 36;
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fillStyle = '#785035';
    ctx.fill();
    ctx.fillStyle = '#f7f3ec';
    ctx.font = '600 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(b.order), cx, cy + 7);
    ctx.textAlign = 'left';

    const thumbX = pad + 52;
    const thumbY = y + 14;
    const th = 72;
    if (thumb) {
      ctx.save();
      roundRect(ctx, thumbX, thumbY, th, th, 8);
      ctx.clip();
      const scale = Math.max(th / thumb.naturalWidth, th / thumb.naturalHeight);
      const dw = thumb.naturalWidth * scale;
      const dh = thumb.naturalHeight * scale;
      ctx.drawImage(thumb, thumbX + (th - dw) / 2, thumbY + (th - dh) / 2, dw, dh);
      ctx.restore();
      roundRect(ctx, thumbX, thumbY, th, th, 8);
      ctx.strokeStyle = '#e5ddd0';
      ctx.stroke();
    } else {
      roundRect(ctx, thumbX, thumbY, th, th, 8);
      ctx.fillStyle = '#efe8dc';
      ctx.fill();
      ctx.strokeStyle = '#e5ddd0';
      ctx.stroke();
    }

    const tx = thumbX + th + 16;
    const maxTextW = W - pad - tx;
    let ty = y + 28;
    ctx.fillStyle = '#2c2825';
    ctx.font = '600 26px "PingFang SC", system-ui, sans-serif';
    ctx.fillText(wrapLines(ctx, b.label, maxTextW, 1)[0] || b.label, tx, ty);
    ty += 30;
    if (b.happen) {
      ctx.fillStyle = '#3a3632';
      ctx.font = '400 22px "PingFang SC", system-ui, sans-serif';
      for (const ln of wrapLines(ctx, b.happen, maxTextW, 2)) {
        ctx.fillText(ln, tx, ty);
        ty += 26;
      }
    }
    if (b.link) {
      ctx.fillStyle = '#8a8278';
      ctx.font = '400 18px "PingFang SC", system-ui, sans-serif';
      for (const ln of wrapLines(ctx, b.link, maxTextW, 1)) {
        ctx.fillText(ln, tx, ty);
        ty += 22;
      }
    }
    if (b.ref) {
      ctx.fillStyle = '#9a9186';
      ctx.font = '400 16px "PingFang SC", system-ui, sans-serif';
      ctx.fillText(formatGroupRefLabel(b.ref) || b.ref, tx, ty);
    }
    y += rowH;
  }

  ctx.strokeStyle = '#e5ddd0';
  ctx.beginPath();
  ctx.moveTo(pad, H - 64);
  ctx.lineTo(W - pad, H - 64);
  ctx.stroke();
  ctx.fillStyle = '#9a9186';
  ctx.font = '400 18px "PingFang SC", system-ui, sans-serif';
  ctx.fillText(`释义说明，仅供参考 · ${BRAND_NAME} · ${BRAND_TAGLINE}`, pad, H - 36);

  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/png', 0.92);
  });
}

export async function shareDenseInfographic(
  input: DenseInfographicInput,
): Promise<ShareOutboundResult> {
  const path = knowledgeRelatedHref({ kind: input.kind, id: input.id, label: '' });
  const shareUrl = toCanonicalShareUrl(path);
  const kindLabel = knowledgeKindLabel(input.kind);
  const blob = await renderDenseInfographicPng(input);
  const file = blob
    ? new File([blob], `${input.id}-dense.png`, { type: 'image/png' })
    : null;
  const body =
    input.guide ||
    input.beats
      .slice(0, 3)
      .map((b) => `${b.order}.${b.label}${b.happen ? `：${b.happen}` : ''}`)
      .join('；');
  return shareOutbound({
    title: `${input.title}｜${BRAND_NAME}`,
    text: [body, `在${BRAND_NAME}打开${kindLabel}继续了解`].filter(Boolean).join('\n'),
    url: shareUrl,
    file,
    allowDownload: true,
  });
}

export function denseInputFromLayout(opts: {
  kind: KnowledgeRelatedKind;
  id: string;
  title: string;
  guide?: string;
  refSpan?: string;
  arc?: { name: string }[];
  beats: DenseBeat[];
}): DenseInfographicInput {
  return {
    kind: opts.kind,
    id: opts.id,
    title: opts.title,
    guide: opts.guide,
    refSpan: opts.refSpan,
    arcNames: (opts.arc || []).map((a) => a.name),
    beats: opts.beats,
  };
}
