/** 笔记长文：客户端生成 1080×1920 纸页 PNG（小红书式长文 + 彼爱纸感） */

const W = 1080;
const H = 1920;

const MARGIN_X = 96;
const CONTENT_W = W - MARGIN_X * 2;

const TITLE_FONT = '700 58px "Noto Serif SC", "Songti SC", "STSong", "Source Han Serif SC", serif';
const COVER_GUIDE_FONT =
  '400 34px "PingFang SC", "Noto Sans SC", "Hiragino Sans GB", system-ui, sans-serif';
const BRAND_FONT =
  '600 26px "PingFang SC", "Noto Sans SC", "Hiragino Sans GB", system-ui, sans-serif';
const BODY_FONT =
  '400 38px "PingFang SC", "Noto Sans SC", "Hiragino Sans GB", system-ui, sans-serif';
const META_FONT =
  '500 24px "PingFang SC", "Noto Sans SC", "Hiragino Sans GB", system-ui, sans-serif';

const BODY_LINE = 68; // ~1.79 × 38
const PARA_GAP = 36;
const INDENT = '　　'; // 两全角空格，中文首行缩进

/** 不宜出现在行首的标点 */
const NO_LINE_START = new Set(
  '，、。．！？；：》」』）】…—–,)]}'.split(''),
);
const NO_LINE_END = new Set('《「『（【([{'.split(''));

export function splitNoteParagraphs(body: string): string[] {
  const parts = body
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/[ \t]+\n/g, '\n').replace(/\n+/g, '\n').trim())
    .filter(Boolean);
  if (parts.length) return parts.slice(0, 40);
  const one = body.trim();
  return one ? [one] : [];
}

function paintPaper(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, W * 0.15, H);
  g.addColorStop(0, '#fffdf8');
  g.addColorStop(0.45, '#faf6ef');
  g.addColorStop(1, '#f3ebe0');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 轻纸边，不抢正文
  ctx.strokeStyle = 'rgba(166, 90, 58, 0.14)';
  ctx.lineWidth = 2;
  ctx.strokeRect(36, 36, W - 72, H - 72);
}

function paintBrand(ctx: CanvasRenderingContext2D, y = 88) {
  ctx.fillStyle = 'rgba(166, 90, 58, 0.78)';
  ctx.font = BRAND_FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('彼爱 · 长文', MARGIN_X, y);

  ctx.strokeStyle = 'rgba(196, 165, 116, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MARGIN_X, y + 18);
  ctx.lineTo(MARGIN_X + 120, y + 18);
  ctx.stroke();
}

function paintPageFooter(
  ctx: CanvasRenderingContext2D,
  pageIndex: number,
  pageTotal: number,
) {
  ctx.fillStyle = 'rgba(107, 99, 88, 0.55)';
  ctx.font = META_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${pageIndex} / ${pageTotal}`, W / 2, H - 72);
}

/** CJK 友好折行：避免行首标点、尽量不在开括号后断 */
function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 999,
): string[] {
  const raw = text.replace(/\s*\n\s*/g, ' ').replace(/[ \t]+/g, ' ').trim();
  if (!raw) return [];
  const chars = Array.from(raw);
  const lines: string[] = [];
  let cur = '';

  const push = (s: string) => {
    if (s) lines.push(s);
  };

  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i]!;
    const trial = cur + ch;
    if (ctx.measureText(trial).width <= maxWidth) {
      cur = trial;
      continue;
    }
    // 行首禁则：把标点留在上行
    if (cur && NO_LINE_START.has(ch)) {
      cur += ch;
      // 超宽则硬断
      if (ctx.measureText(cur).width > maxWidth && cur.length > 1) {
        const keep = cur.slice(0, -1);
        push(keep);
        cur = cur.slice(-1);
      }
      continue;
    }
    // 行尾禁则：开括号带到下行
    if (cur && NO_LINE_END.has(cur.slice(-1))) {
      const move = cur.slice(-1);
      const keep = cur.slice(0, -1);
      if (keep) push(keep);
      cur = move + ch;
      continue;
    }
    push(cur);
    cur = ch;
    if (lines.length >= maxLines) {
      cur = '';
      break;
    }
  }
  if (cur && lines.length < maxLines) push(cur);

  if (lines.length === maxLines && chars.join('').length > lines.join('').length) {
    const last = lines[maxLines - 1] || '';
    if (last.length > 1) lines[maxLines - 1] = `${last.slice(0, -1)}…`;
  }
  return lines;
}

function wrapParagraph(
  ctx: CanvasRenderingContext2D,
  para: string,
  maxWidth: number,
  indentFirst: boolean,
): string[] {
  ctx.font = BODY_FONT;
  const cleaned = para.replace(/\s*\n\s*/g, ' ').replace(/[ \t]+/g, ' ').trim();
  if (!cleaned) return [];
  if (!indentFirst) return wrapLines(ctx, cleaned, maxWidth);

  const indentW = ctx.measureText(INDENT).width;
  const firstMax = Math.max(40, maxWidth - indentW);
  const chars = Array.from(cleaned);
  let first = '';
  let restStart = 0;
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i]!;
    const trial = first + ch;
    if (ctx.measureText(trial).width <= firstMax) {
      first = trial;
      restStart = i + 1;
      continue;
    }
    if (first && NO_LINE_START.has(ch)) {
      first += ch;
      restStart = i + 1;
      if (ctx.measureText(first).width > firstMax && first.length > 1) {
        restStart = i;
        first = first.slice(0, -1);
      }
    }
    break;
  }
  if (!first) return wrapLines(ctx, cleaned, maxWidth);
  const rest = chars.slice(restStart).join('');
  return [`${INDENT}${first}`, ...(rest ? wrapLines(ctx, rest, maxWidth) : [])];
}

type BodyPage = { lines: string[]; isContinuation: boolean };

function paginateBody(ctx: CanvasRenderingContext2D, paragraphs: string[]): BodyPage[] {
  ctx.font = BODY_FONT;
  const topY = 168;
  const bottomY = H - 140;
  const usable = bottomY - topY;
  const maxLinesRough = Math.floor(usable / BODY_LINE);

  const pages: BodyPage[] = [];
  let cur: string[] = [];
  let used = 0;
  let isContinuation = false;

  const flush = () => {
    if (!cur.length) return;
    pages.push({ lines: cur, isContinuation });
    cur = [];
    used = 0;
    isContinuation = true;
  };

  for (let pi = 0; pi < paragraphs.length; pi += 1) {
    const lines = wrapParagraph(ctx, paragraphs[pi]!, CONTENT_W, true);
    if (!lines.length) continue;

    // 段前间距（非页首）
    const gap = cur.length > 0 ? PARA_GAP : 0;
    let need = gap + lines.length * BODY_LINE;

    if (cur.length > 0 && used + need > usable && cur.length >= Math.min(4, maxLinesRough)) {
      flush();
      need = lines.length * BODY_LINE;
    }

    for (let li = 0; li < lines.length; li += 1) {
      const lineCost = (cur.length > 0 && li === 0 && gap ? PARA_GAP : 0) + BODY_LINE;
      if (cur.length > 0 && used + lineCost > usable) {
        flush();
      }
      if (li === 0 && cur.length > 0 && gap) {
        // 用空行近似段距（半行高）
        cur.push('');
        used += PARA_GAP;
      }
      cur.push(lines[li]!);
      used += BODY_LINE;
    }
  }
  flush();
  return pages.length ? pages : [{ lines: ['（空）'], isContinuation: false }];
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

function newCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建画布');
  return { canvas, ctx };
}

/** 封面：标题 + 导语（长文开篇） */
export async function renderNoteCoverPng(opts: {
  title: string;
  guide: string;
}): Promise<Blob> {
  const { canvas, ctx } = newCanvas();
  paintPaper(ctx);
  paintBrand(ctx);

  ctx.fillStyle = '#2c2825';
  ctx.font = TITLE_FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const titleLines = wrapLines(ctx, opts.title || '未命名', CONTENT_W, 4);
  let y = 320;
  for (const line of titleLines) {
    ctx.fillText(line, MARGIN_X, y);
    y += 78;
  }

  // 装饰短线
  y += 28;
  ctx.strokeStyle = 'rgba(166, 90, 58, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(MARGIN_X, y);
  ctx.lineTo(MARGIN_X + 72, y);
  ctx.stroke();
  y += 56;

  ctx.fillStyle = '#5c554c';
  ctx.font = COVER_GUIDE_FONT;
  const guideLines = wrapLines(ctx, opts.guide || '', CONTENT_W, 8);
  for (const line of guideLines) {
    ctx.fillText(line, MARGIN_X, y);
    y += 54;
  }

  ctx.fillStyle = 'rgba(107, 99, 88, 0.62)';
  ctx.font = META_FONT;
  ctx.fillText('左右滑动阅读', MARGIN_X, H - 120);

  return canvasToBlob(canvas);
}

/** 正文页：段内自动折行、跨页续排（类小红书长文） */
export async function renderNoteBodyPng(opts: {
  title: string;
  sectionLabel: string;
  body: string;
  pageIndex: number;
  pageTotal: number;
  /** 续页时弱化标题 */
  continuation?: boolean;
}): Promise<Blob> {
  const { canvas, ctx } = newCanvas();
  paintPaper(ctx);
  paintBrand(ctx);

  let y = 150;
  if (!opts.continuation) {
    ctx.fillStyle = 'rgba(107, 99, 88, 0.7)';
    ctx.font = META_FONT;
    ctx.textAlign = 'left';
    ctx.fillText(opts.sectionLabel || '正文', MARGIN_X, y);
    y = 210;
  } else {
    ctx.fillStyle = 'rgba(107, 99, 88, 0.5)';
    ctx.font = META_FONT;
    ctx.textAlign = 'left';
    const short =
      (opts.title || '').length > 16
        ? `${(opts.title || '').slice(0, 15)}…`
        : opts.title || '';
    ctx.fillText(short ? `${short} · 续` : '续', MARGIN_X, y);
    y = 200;
  }

  ctx.fillStyle = '#2c2825';
  ctx.font = BODY_FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const paras = splitNoteParagraphs(opts.body);
  const lines =
    paras.length <= 1
      ? wrapParagraph(ctx, opts.body || '', CONTENT_W, true)
      : paras.flatMap((p, i) => {
          const wrapped = wrapParagraph(ctx, p, CONTENT_W, true);
          return i === 0 ? wrapped : ['', ...wrapped];
        });

  for (const line of lines) {
    if (y > H - 150) break;
    if (line === '') {
      y += PARA_GAP * 0.55;
      continue;
    }
    ctx.fillText(line, MARGIN_X, y);
    y += BODY_LINE;
  }

  paintPageFooter(ctx, opts.pageIndex, opts.pageTotal);
  return canvasToBlob(canvas);
}

/**
 * 一次生成整篇长文纸页：封面 + 按版心自动分页的正文图。
 * 发布默认走这条，保证展示为图片而非 HTML 文本叶。
 */
export async function renderNoteArticlePngs(opts: {
  title: string;
  body: string;
}): Promise<{ cover: Blob; bodies: Blob[]; paragraphs: string[] }> {
  const paragraphs = splitNoteParagraphs(opts.body);
  const guide = paragraphs[0] || '';
  const cover = await renderNoteCoverPng({
    title: opts.title,
    guide: guide.length > 120 ? `${guide.slice(0, 119)}…` : guide,
  });

  const { ctx } = newCanvas();
  const pages = paginateBody(ctx, paragraphs);
  const total = pages.length;
  const bodies: Blob[] = [];
  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i]!;
    const blob = await renderBodyPageFromLines({
      title: opts.title,
      lines: page.lines,
      continuation: page.isContinuation,
      pageIndex: i + 1,
      pageTotal: total,
    });
    bodies.push(blob);
  }

  return { cover, bodies, paragraphs };
}

async function renderBodyPageFromLines(opts: {
  title: string;
  lines: string[];
  continuation: boolean;
  pageIndex: number;
  pageTotal: number;
}): Promise<Blob> {
  const { canvas, ctx } = newCanvas();
  paintPaper(ctx);
  paintBrand(ctx);

  let y = 150;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  if (!opts.continuation) {
    ctx.fillStyle = 'rgba(107, 99, 88, 0.7)';
    ctx.font = META_FONT;
    ctx.fillText('正文', MARGIN_X, y);
    y = 214;
  } else {
    ctx.fillStyle = 'rgba(107, 99, 88, 0.5)';
    ctx.font = META_FONT;
    const short =
      (opts.title || '').length > 16
        ? `${(opts.title || '').slice(0, 15)}…`
        : opts.title || '';
    ctx.fillText(short ? `${short} · 续` : '续', MARGIN_X, y);
    y = 200;
  }

  ctx.fillStyle = '#2c2825';
  ctx.font = BODY_FONT;
  for (const line of opts.lines) {
    if (y > H - 150) break;
    if (line === '') {
      y += PARA_GAP * 0.55;
      continue;
    }
    ctx.fillText(line, MARGIN_X, y);
    y += BODY_LINE;
  }

  paintPageFooter(ctx, opts.pageIndex, opts.pageTotal);
  return canvasToBlob(canvas);
}
