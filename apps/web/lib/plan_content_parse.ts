import { bookIdToChineseName } from './ref_label';

export type PlanChapterRange = {
  bookId: string;
  bookName: string;
  from: number;
  to: number;
};

/** 中文书名 → OSIS id（最长匹配优先） */
const CN_TO_BOOK_ID: Record<string, string> = {};
for (const [id, cn] of Object.entries(
  Object.fromEntries(
    [
      'GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA', '1KI', '2KI',
      '1CH', '2CH', 'EZR', 'NEH', 'EST', 'JOB', 'PSA', 'PRO', 'ECC', 'SNG', 'ISA', 'JER',
      'LAM', 'EZK', 'DAN', 'HOS', 'JOL', 'AMO', 'OBA', 'JON', 'MIC', 'NAH', 'HAB', 'ZEP',
      'HAG', 'ZEC', 'MAL', 'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL',
      'EPH', 'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE',
      '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV',
    ].map((id) => [id, bookIdToChineseName(id)]),
  ),
)) {
  if (cn) CN_TO_BOOK_ID[cn] = id;
}

const BOOK_CN_NAMES = Object.keys(CN_TO_BOOK_ID).sort((a, b) => b.length - a.length);

export function formatPlanChapterRange(r: PlanChapterRange): string {
  if (r.from === r.to) return `${r.bookName} ${r.from}章`;
  return `${r.bookName} ${r.from}–${r.to}章`;
}

export function rangesToCustomRefs(ranges: PlanChapterRange[]): string | null {
  if (!ranges.length) return null;
  return ranges
    .map((r) => (r.from === r.to ? `${r.bookId}.${r.from}` : `${r.bookId}.${r.from}-${r.to}`))
    .join(',');
}

export function mergeCustomRefs(...parts: (string | null | undefined)[]): string | null {
  const tokens = parts
    .filter(Boolean)
    .flatMap((p) => p!.split(','))
    .map((t) => t.trim())
    .filter(Boolean);
  return tokens.length ? [...new Set(tokens)].join(',') : null;
}

/** 将用户输入转为 generate-plan 的 custom_refs（OSIS 章范围） */
export function parsePlanContentToRefs(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  // 已是 OSIS / 英文缩写：JHN.1-3, GEN.1, PSA.23
  if (/^[A-Za-z0-9.,\s\-–—至]+$/u.test(text) && /\./.test(text)) {
    return text
      .replace(/，/g, ',')
      .replace(/\s+/g, '')
      .replace(/–|—/g, '-');
  }

  const parts: string[] = [];
  const segments = text.split(/[,，;；\n]+/).map((s) => s.trim()).filter(Boolean);

  for (const seg of segments) {
    let matched = false;
    for (const bookCn of BOOK_CN_NAMES) {
      if (!seg.startsWith(bookCn)) continue;
      const rest = seg.slice(bookCn.length).trim();
      const range = rest.match(/^(\d+)\s*[-–—至]\s*(\d+)\s*章?$/);
      if (range) {
        const bid = CN_TO_BOOK_ID[bookCn];
        parts.push(`${bid}.${range[1]}-${range[2]}`);
        matched = true;
        break;
      }
      const single = rest.match(/^第?\s*(\d+)\s*章?$/);
      if (single) {
        parts.push(`${CN_TO_BOOK_ID[bookCn]}.${single[1]}`);
        matched = true;
        break;
      }
    }
    if (!matched && /\./.test(seg)) {
      parts.push(seg.replace(/\s+/g, ''));
    }
  }

  return parts.length ? parts.join(',') : null;
}
