/** 笔记手稿：客户端生成 1080×1920 纸页 PNG（彼爱静穆纸感） */

const W = 1080;
const H = 1920;

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const chars = Array.from(text.replace(/\s+/g, ' ').trim());
  const lines: string[] = [];
  let cur = '';
  for (const ch of chars) {
    const trial = cur + ch;
    if (ctx.measureText(trial).width <= maxWidth) {
      cur = trial;
      continue;
    }
    if (cur) lines.push(cur);
    cur = ch;
    if (lines.length >= maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines && chars.length > 0) {
    const last = lines[maxLines - 1] || '';
    if (last.length > 1) lines[maxLines - 1] = `${last.slice(0, -1)}…`;
  }
  return lines;
}

function paintPaper(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#f7f1e6');
  g.addColorStop(0.55, '#f3ebe0');
  g.addColorStop(1, '#ebe1d0');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(166, 90, 58, 0.22)';
  ctx.lineWidth = 3;
  ctx.strokeRect(48, 48, W - 96, H - 96);

  ctx.strokeStyle = 'rgba(196, 165, 116, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(64, 64, W - 128, H - 128);
}

function paintSeal(ctx: CanvasRenderingContext2D) {
  const cx = W - 160;
  const cy = 160;
  ctx.beginPath();
  ctx.arc(cx, cy, 52, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(166, 90, 58, 0.72)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 40, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(166, 90, 58, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = 'rgba(166, 90, 58, 0.82)';
  ctx.font = '700 28px "Noto Serif SC", "Songti SC", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('稿', cx, cy + 1);
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('导出图片失败'))),
      'image/png',
      0.92,
    );
  });
}

/** 封面：标题 + 导语 */
export async function renderNoteCoverPng(opts: {
  title: string;
  guide: string;
}): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建画布');

  paintPaper(ctx);
  paintSeal(ctx);

  ctx.fillStyle = 'rgba(166, 90, 58, 0.75)';
  ctx.font = '600 28px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('彼爱手稿', 120, 220);

  ctx.fillStyle = '#2c2825';
  ctx.font = '700 64px "Noto Serif SC", "Songti SC", serif';
  const titleLines = wrapLines(ctx, opts.title || '未命名', W - 240, 3);
  let y = 420;
  for (const line of titleLines) {
    ctx.fillText(line, 120, y);
    y += 86;
  }

  ctx.fillStyle = '#6b6358';
  ctx.font = '400 36px system-ui, sans-serif';
  const guideLines = wrapLines(ctx, opts.guide || '', W - 240, 6);
  y += 40;
  for (const line of guideLines) {
    ctx.fillText(line, 120, y);
    y += 56;
  }

  ctx.fillStyle = 'rgba(107, 99, 88, 0.7)';
  ctx.font = '500 26px system-ui, sans-serif';
  ctx.fillText('点开即读', 120, H - 140);

  return canvasToBlob(canvas);
}

/** 正文页：段标题 + 正文 */
export async function renderNoteBodyPng(opts: {
  title: string;
  sectionLabel: string;
  body: string;
  pageIndex: number;
  pageTotal: number;
}): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建画布');

  paintPaper(ctx);
  paintSeal(ctx);

  ctx.fillStyle = 'rgba(107, 99, 88, 0.75)';
  ctx.font = '500 26px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(opts.sectionLabel || `第 ${opts.pageIndex} 段`, 120, 200);

  ctx.fillStyle = '#2c2825';
  ctx.font = '400 40px "Noto Serif SC", "Songti SC", serif';
  const lines = wrapLines(ctx, opts.body || '', W - 240, 28);
  let y = 300;
  for (const line of lines) {
    ctx.fillText(line, 120, y);
    y += 58;
  }

  ctx.fillStyle = 'rgba(107, 99, 88, 0.65)';
  ctx.font = '500 24px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${opts.pageIndex} / ${opts.pageTotal}`, W / 2, H - 120);

  return canvasToBlob(canvas);
}
