/** §19.14.12 知识信息图分享：上图下文合成（字不挡母题） */

import { clientWithBasePath } from './basePath';
import { BRAND_NAME, BRAND_TAGLINE } from './brand';
import { shareOutbound, type ShareOutboundResult } from './share_outbound';
import { toCanonicalShareUrl } from './share_site';
import {
  knowledgeKindLabel,
  knowledgeRelatedHref,
  type KnowledgeRelatedKind,
} from './knowledge_story';

export type InfographicShareBeat = {
  order: number;
  label: string;
  happen?: string;
  ref?: string;
};

export type InfographicShareInput = {
  kind: KnowledgeRelatedKind;
  id: string;
  title: string;
  guide?: string;
  /** 干净母题图（public 路径或绝对 URL） */
  vignetteUrl?: string | null;
  beats: InfographicShareBeat[];
  /** 弧名，可选 */
  arcNames?: string[];
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

function resolveVignetteUrl(url?: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
  return clientWithBasePath(url.startsWith('/') ? url : `/${url}`);
}

/** 上图（干净母题）+ 下文（标题/导语/站序事实）长图 */
export async function renderKnowledgeInfographicPng(
  input: InfographicShareInput,
): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  const W = 1080;
  const artH = 560;
  const pad = 48;
  const beats = (input.beats || []).slice(0, 10);

  // 先量正文高度
  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) return null;
  measure.font = '600 44px "PingFang SC", "Noto Sans SC", system-ui, sans-serif';
  const titleLines = wrapLines(measure, input.title, W - pad * 2, 2);
  measure.font = '400 28px "PingFang SC", "Noto Sans SC", system-ui, sans-serif';
  const guideLines = wrapLines(measure, input.guide || '', W - pad * 2, 3);
  const beatBlock = beats.length * 56;
  const panelH =
    pad +
    titleLines.length * 52 +
    12 +
    (guideLines.length ? guideLines.length * 38 + 12 : 0) +
    (input.arcNames?.length ? 36 : 0) +
    28 +
    beatBlock +
    72 +
    pad;

  const H = artH + panelH;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // 纸底
  ctx.fillStyle = '#f7f3ec';
  ctx.fillRect(0, 0, W, H);

  // —— 上图 ——
  const vUrl = resolveVignetteUrl(input.vignetteUrl);
  const art = vUrl ? await loadImage(vUrl) : null;
  if (art) {
    const scale = Math.max(W / art.naturalWidth, artH / art.naturalHeight);
    const dw = art.naturalWidth * scale;
    const dh = art.naturalHeight * scale;
    ctx.drawImage(art, (W - dw) / 2, (artH - dh) / 2, dw, dh);
  } else {
    ctx.fillStyle = '#e4d9c8';
    ctx.fillRect(0, 0, W, artH);
    ctx.fillStyle = '#6e675f';
    ctx.font = '400 28px "PingFang SC", system-ui, sans-serif';
    ctx.fillText('路径示意 · 详见 App 内多区块讲解', pad, artH / 2);
  }

  // 轻分隔
  ctx.fillStyle = '#e5ddd0';
  ctx.fillRect(0, artH, W, 1);

  // —— 下文面板 ——
  let y = artH + pad;
  ctx.fillStyle = '#2c2825';
  ctx.font = '600 44px "PingFang SC", "Noto Sans SC", system-ui, sans-serif';
  for (const ln of titleLines) {
    ctx.fillText(ln, pad, y);
    y += 52;
  }
  y += 8;

  if (guideLines.length) {
    ctx.fillStyle = '#6e675f';
    ctx.font = '400 28px "PingFang SC", "Noto Sans SC", system-ui, sans-serif';
    for (const ln of guideLines) {
      ctx.fillText(ln, pad, y);
      y += 38;
    }
    y += 8;
  }

  if (input.arcNames?.length) {
    ctx.fillStyle = '#5b6b4f';
    ctx.font = '500 24px "PingFang SC", system-ui, sans-serif';
    ctx.fillText(input.arcNames.join(' → '), pad, y);
    y += 36;
  }

  ctx.fillStyle = '#8a8278';
  ctx.font = '500 22px "PingFang SC", system-ui, sans-serif';
  ctx.fillText('站序事实', pad, y);
  y += 28;

  for (const b of beats) {
    // 编号圆
    ctx.beginPath();
    ctx.arc(pad + 14, y - 6, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#785035';
    ctx.fill();
    ctx.fillStyle = '#f7f3ec';
    ctx.font = '600 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(b.order), pad + 14, y);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#2c2825';
    ctx.font = '600 26px "PingFang SC", system-ui, sans-serif';
    ctx.fillText(b.label, pad + 40, y);
    if (b.happen) {
      ctx.fillStyle = '#6e675f';
      ctx.font = '400 24px "PingFang SC", system-ui, sans-serif';
      const hp = wrapLines(ctx, b.happen, W - pad * 2 - 40, 1)[0] || b.happen;
      ctx.fillText(hp, pad + 40, y + 28);
    }
    y += 56;
  }

  y = Math.max(y + 12, H - 56);
  ctx.fillStyle = '#9a9186';
  ctx.font = '400 20px "PingFang SC", system-ui, sans-serif';
  ctx.fillText(`释义说明，仅供参考 · ${BRAND_NAME} · ${BRAND_TAGLINE}`, pad, y);

  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/png', 0.92);
  });
}

/** 优先上图下文信息图；失败则由调用方回退氛围卡 */
export async function shareKnowledgeInfographic(
  input: InfographicShareInput,
): Promise<ShareOutboundResult> {
  const path = knowledgeRelatedHref({ kind: input.kind, id: input.id, label: '' });
  const shareUrl = toCanonicalShareUrl(path);
  const kindLabel = knowledgeKindLabel(input.kind);
  const blob = await renderKnowledgeInfographicPng(input);
  const file = blob
    ? new File([blob], 'knowledge-infographic.png', { type: 'image/png' })
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
