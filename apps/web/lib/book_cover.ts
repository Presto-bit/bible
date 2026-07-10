/** 经卷封面缩略图：横版书脊风格，适配横滑卡顶部区域 */

import { bookAbbr } from './book_abbr';
import { bookIdToChineseName, CANON_BOOK_IDS } from './ref_label';

const NT_START = CANON_BOOK_IDS.indexOf('MAT');

type CoverPalette = {
  bg1: string;
  bg2: string;
  spine: string;
  ink: string;
  accent: string;
  glow: string;
  label: string;
};

const OT_PALETTES: CoverPalette[] = [
  { bg1: '#f4ebe0', bg2: '#c9a882', spine: '#8a6848', ink: '#3d2e24', accent: '#b88858', glow: '#fff8f0', label: '旧约' },
  { bg1: '#eaf0e4', bg2: '#9cb08c', spine: '#5a7050', ink: '#2a3828', accent: '#7a9a6a', glow: '#f4faf0', label: '旧约' },
  { bg1: '#f0e6dc', bg2: '#c4a090', spine: '#886858', ink: '#402820', accent: '#c09070', glow: '#fff6ee', label: '旧约' },
  { bg1: '#e4ecf0', bg2: '#90aab8', spine: '#506878', ink: '#243038', accent: '#6890a8', glow: '#f0f8fc', label: '旧约' },
];

const NT_PALETTES: CoverPalette[] = [
  { bg1: '#eef3fa', bg2: '#98b0d0', spine: '#506888', ink: '#1e2c42', accent: '#5880b8', glow: '#f8fbff', label: '新约' },
  { bg1: '#e8f4ee', bg2: '#88c0a8', spine: '#488068', ink: '#1e3828', accent: '#58a080', glow: '#f2fcf6', label: '新约' },
  { bg1: '#f2ecf6', bg2: '#b8a0c8', spine: '#786090', ink: '#342840', accent: '#9878b0', glow: '#faf6fc', label: '新约' },
  { bg1: '#faf0e6', bg2: '#d8b890', spine: '#987048', ink: '#3c2818', accent: '#c89860', glow: '#fffaf2', label: '新约' },
];

function paletteForBook(bookId: string): CoverPalette {
  const id = bookId.toUpperCase();
  const idx = (CANON_BOOK_IDS as readonly string[]).indexOf(id);
  const palettes = idx >= NT_START ? NT_PALETTES : OT_PALETTES;
  const seed = idx >= 0 ? idx : id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return palettes[seed % palettes.length]!;
}

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function trimName(name: string, max = 5): string {
  if (name.length <= max) return name;
  return `${name.slice(0, max - 1)}…`;
}

export function bookIdFromReaderHref(href: string): { bookId: string; chapter?: number } | null {
  try {
    const url = new URL(href, 'https://local.invalid');
    const book = url.searchParams.get('book');
    if (!book) return null;
    const chapterRaw = url.searchParams.get('chapter');
    return {
      bookId: book.toUpperCase(),
      chapter: chapterRaw ? Number.parseInt(chapterRaw, 10) : undefined,
    };
  } catch {
    return null;
  }
}

export function bookCoverDataUrl(
  bookId: string,
  opts?: { chapter?: number },
): string {
  const id = bookId.toUpperCase();
  const name = bookIdToChineseName(id);
  const abbr = bookAbbr(name);
  const shortName = trimName(name, 6);
  const p = paletteForBook(id);
  const abbrSize = abbr.length >= 3 ? 52 : abbr.length === 2 ? 64 : 76;
  const chapter = opts?.chapter;
  const chapterBadge = chapter
    ? `<g transform="translate(268,152)">
        <rect x="-36" y="-18" width="72" height="28" rx="14" fill="rgba(255,255,255,0.88)"/>
        <text x="0" y="2" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-size="14" font-weight="700" fill="${p.ink}">第 ${chapter} 章</text>
      </g>`
    : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" role="img">
  <defs>
    <linearGradient id="face" x1="0" y1="0" x2="0.15" y2="1">
      <stop offset="0" stop-color="${p.bg1}"/>
      <stop offset="0.55" stop-color="${p.bg2}"/>
      <stop offset="1" stop-color="${p.spine}"/>
    </linearGradient>
    <linearGradient id="spine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${p.spine}"/>
      <stop offset="1" stop-color="${p.accent}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.62" cy="0.28" r="0.55">
      <stop offset="0" stop-color="${p.glow}" stop-opacity="0.95"/>
      <stop offset="1" stop-color="${p.glow}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="320" height="200" fill="url(#face)"/>
  <rect x="0" y="0" width="28" height="200" fill="url(#spine)"/>
  <rect x="6" y="0" width="3" height="200" fill="#fff" opacity="0.12"/>
  <rect x="22" y="0" width="1" height="200" fill="#000" opacity="0.08"/>
  <ellipse cx="200" cy="52" rx="120" ry="72" fill="url(#glow)"/>
  <path d="M36 36 H304" stroke="${p.accent}" stroke-opacity="0.18" stroke-width="1"/>
  <path d="M36 168 H304" stroke="${p.accent}" stroke-opacity="0.14" stroke-width="1"/>
  <path d="M36 48 Q160 72 284 48" fill="none" stroke="${p.accent}" stroke-opacity="0.12" stroke-width="1.5"/>
  <text x="168" y="108" text-anchor="middle" font-family="system-ui,-apple-system,PingFang SC,sans-serif" font-size="${abbrSize}" font-weight="800" fill="${p.ink}" opacity="0.92">${esc(abbr)}</text>
  <text x="168" y="138" text-anchor="middle" font-family="system-ui,-apple-system,PingFang SC,sans-serif" font-size="13" font-weight="500" fill="${p.ink}" fill-opacity="0.58">${esc(shortName)}</text>
  <text x="48" y="178" font-family="system-ui,-apple-system,sans-serif" font-size="10" font-weight="600" letter-spacing="0.12em" fill="${p.ink}" fill-opacity="0.38">${esc(p.label)}</text>
  ${chapterBadge}
</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
