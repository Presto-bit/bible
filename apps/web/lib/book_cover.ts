/** 经卷封面缩略图：按书卷 ID 生成矢量封面（无需 66 张静态图） */

import { bookAbbr } from './book_abbr';
import { bookIdToChineseName, CANON_BOOK_IDS } from './ref_label';

const NT_START = CANON_BOOK_IDS.indexOf('MAT');

type CoverPalette = { bg1: string; bg2: string; ink: string; accent: string; label: string };

const OT_PALETTES: CoverPalette[] = [
  { bg1: '#ebe3d6', bg2: '#c8b59a', ink: '#4a3f35', accent: '#9a7352', label: '旧约' },
  { bg1: '#e0e8d8', bg2: '#b5c4a8', ink: '#384535', accent: '#6d8a62', label: '旧约' },
  { bg1: '#e6ddd4', bg2: '#c4aea0', ink: '#4a3a32', accent: '#a67c62', label: '旧约' },
  { bg1: '#dce4e8', bg2: '#a8bcc4', ink: '#354248', accent: '#5a7a88', label: '旧约' },
];

const NT_PALETTES: CoverPalette[] = [
  { bg1: '#e8eef5', bg2: '#b8c8dc', ink: '#2e3d52', accent: '#5a7ab0', label: '新约' },
  { bg1: '#e5f0ea', bg2: '#a8cfc0', ink: '#2d4538', accent: '#4a8f72', label: '新约' },
  { bg1: '#f0e8f2', bg2: '#c8b0d4', ink: '#423048', accent: '#8a62a0', label: '新约' },
  { bg1: '#f5ece4', bg2: '#d4b8a0', ink: '#4a3828', accent: '#b07848', label: '新约' },
];

function paletteForBook(bookId: string): CoverPalette {
  const id = bookId.toUpperCase();
  const idx = (CANON_BOOK_IDS as readonly string[]).indexOf(id);
  const palettes = idx >= NT_START ? NT_PALETTES : OT_PALETTES;
  const seed = idx >= 0 ? idx : id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return palettes[seed % palettes.length]!;
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

export function bookCoverDataUrl(bookId: string): string {
  const id = bookId.toUpperCase();
  const name = bookIdToChineseName(id);
  const abbr = bookAbbr(name);
  const p = paletteForBook(id);
  const fontSize = abbr.length >= 3 ? 34 : abbr.length === 2 ? 42 : 52;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 160" role="img">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0.2" y2="1">
      <stop offset="0" stop-color="${p.bg1}"/>
      <stop offset="1" stop-color="${p.bg2}"/>
    </linearGradient>
  </defs>
  <rect width="120" height="160" fill="url(#g)"/>
  <rect x="10" y="12" width="100" height="136" rx="6" fill="none" stroke="${p.accent}" stroke-opacity="0.35" stroke-width="1.5"/>
  <path d="M18 28 H102" stroke="${p.accent}" stroke-opacity="0.2" stroke-width="1"/>
  <path d="M18 132 H102" stroke="${p.accent}" stroke-opacity="0.2" stroke-width="1"/>
  <text x="60" y="88" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-size="${fontSize}" font-weight="700" fill="${p.ink}">${abbr}</text>
  <text x="60" y="118" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-size="11" font-weight="500" fill="${p.ink}" fill-opacity="0.62">${p.label}</text>
</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
