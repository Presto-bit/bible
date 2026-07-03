/** 段落标题/注释中的经节引用解析（如 代上1:1、JHN 3:16） */

const CN_ABBR: Record<string, string> = {
  创: 'GEN', 出: 'EXO', 利: 'LEV', 民: 'NUM', 申: 'DEU',
  书: 'JOS', 士: 'JDG', 得: 'RUT', 撒上: '1SA', 撒下: '2SA',
  王上: '1KI', 王下: '2KI', 代上: '1CH', 代下: '2CH',
  拉: 'EZR', 尼: 'NEH', 斯: 'EST', 伯: 'JOB', 诗: 'PSA',
  箴: 'PRO', 传: 'ECC', 歌: 'SNG', 赛: 'ISA', 耶: 'JER',
  哀: 'LAM', 结: 'EZK', 但: 'DAN', 何: 'HOS', 珥: 'JOL',
  摩: 'AMO', 俄: 'OBA', 拿: 'JON', 弥: 'MIC', 鸿: 'NAH',
  哈: 'HAB', 番: 'ZEP', 该: 'HAG', 亚: 'ZEC', 玛: 'MAL',
  太: 'MAT', 可: 'MRK', 路: 'LUK', 约: 'JHN', 徒: 'ACT',
  罗: 'ROM', 林前: '1CO', 林后: '2CO', 加: 'GAL', 弗: 'EPH',
  腓: 'PHP', 西: 'COL', 帖前: '1TH', 帖后: '2TH', 提前: '1TI',
  提后: '2TI', 多: 'TIT', 门: 'PHM', 来: 'HEB', 雅: 'JAS',
  彼前: '1PE', 彼后: '2PE', 约一: '1JN', 约二: '2JN', 约三: '3JN',
  犹: 'JUD', 启: 'REV',
};

/** 将常见中文缩写转为 OSIS 书卷 id + 章:节 */
export function normalizeInlineRef(raw: string): string | null {
  const s = raw.trim().replace(/[（）()]/g, '');
  if (!s) return null;

  const osisMatch = s.match(/^([A-Za-z0-9]+)[.\s]+(\d+)(?:[:.\s]+(\d+))?/);
  if (osisMatch) {
    const book = osisMatch[1].toUpperCase();
    const ch = osisMatch[2];
    const v = osisMatch[3];
    return v ? `${book}.${ch}.${v}` : `${book}.${ch}`;
  }

  const cnMatch = s.match(/^([\u4e00-\u9fff]{1,3})(\d+)[:：](\d+)/);
  if (cnMatch) {
    const book = CN_ABBR[cnMatch[1]];
    if (book) return `${book}.${cnMatch[2]}.${cnMatch[3]}`;
  }

  const cnChOnly = s.match(/^([\u4e00-\u9fff]{1,3})(\d+)章?$/);
  if (cnChOnly) {
    const book = CN_ABBR[cnChOnly[1]];
    if (book) return `${book}.${cnChOnly[2]}`;
  }

  return null;
}

const REF_IN_TEXT =
  /(?:[（(])?((?:[A-Za-z0-9]{2,4}|[\u4e00-\u9fff]{1,3})\s*\d+[:：.\s]\d+(?:\s*[-~–]\s*\d+)?|[\u4e00-\u9fff]{2,6}\d+[:：]\d+(?:-\d+)?)(?:[）)])?/g;

export type InlineRefPart =
  | { kind: 'text'; value: string }
  | { kind: 'ref'; value: string; osis: string | null };

/** 将含经节引用的文本拆成可点击片段 */
export function splitInlineRefs(text: string): InlineRefPart[] {
  const parts: InlineRefPart[] = [];
  let last = 0;
  for (const m of text.matchAll(REF_IN_TEXT)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push({ kind: 'text', value: text.slice(last, idx) });
    const value = m[0];
    parts.push({ kind: 'ref', value, osis: normalizeInlineRef(value) });
    last = idx + value.length;
  }
  if (last < text.length) parts.push({ kind: 'text', value: text.slice(last) });
  return parts.length ? parts : [{ kind: 'text', value: text }];
}

/** API 串珠 ref 格式 "JHN 3:16" → OSIS */
export function refSpaceToOsis(ref: string): string {
  const m = ref.trim().match(/^([A-Za-z0-9]+)\s+(\d+):(\d+)/);
  if (m) return `${m[1].toUpperCase()}.${m[2]}.${m[3]}`;
  return ref.replace(/\s+/g, '.');
}
