/** 将 GEN.1.1 / JHN 3:16 / GEN.2:7 等 ref 转为中文展示（约翰福音 3:16） */

import { normalizeInlineRef } from './inline_ref';

const BOOK_ID_TO_CN: Record<string, string> = {
  GEN: '创世记', EXO: '出埃及记', LEV: '利未记', NUM: '民数记', DEU: '申命记',
  JOS: '约书亚记', JDG: '士师记', RUT: '路得记', '1SA': '撒母耳记上', '2SA': '撒母耳记下',
  '1KI': '列王纪上', '2KI': '列王纪下', '1CH': '历代志上', '2CH': '历代志下',
  EZR: '以斯拉记', NEH: '尼希米记', EST: '以斯帖记', JOB: '约伯记', PSA: '诗篇',
  PRO: '箴言', ECC: '传道书', SNG: '雅歌', ISA: '以赛亚书', JER: '耶利米书',
  LAM: '耶利米哀歌', EZK: '以西结书', DAN: '但以理书', HOS: '何西阿书',
  JOL: '约珥书', AMO: '阿摩司书', OBA: '俄巴底亚书', JON: '约拿书', MIC: '弥迦书',
  NAH: '那鸿书', HAB: '哈巴谷书', ZEP: '西番雅书', HAG: '哈该书', ZEC: '撒迦利亚书',
  MAL: '玛拉基书', MAT: '马太福音', MRK: '马可福音', LUK: '路加福音', JHN: '约翰福音',
  ACT: '使徒行传', ROM: '罗马书', '1CO': '哥林多前书', '2CO': '哥林多后书',
  GAL: '加拉太书', EPH: '以弗所书', PHP: '腓立比书', COL: '歌罗西书',
  '1TH': '帖撒罗尼迦前书', '2TH': '帖撒罗尼迦后书', '1TI': '提摩太前书',
  '2TI': '提摩太后书', TIT: '提多书', PHM: '腓利门书', HEB: '希伯来书',
  JAS: '雅各书', '1PE': '彼得前书', '2PE': '彼得后书', '1JN': '约翰一书',
  '2JN': '约翰二书', '3JN': '约翰三书', JUD: '犹大书', REV: '启示录',
};

function bookCn(bookId: string): string {
  return BOOK_ID_TO_CN[bookId.toUpperCase()] ?? bookId;
}

function formatChapterVerse(name: string, chapter: string, verse?: string): string {
  if (verse) return `${name} ${chapter}:${verse}`;
  return `${name} ${chapter}章`;
}

/** 单条 ref 字符串 → 中文（支持 OSIS 与空格格式） */
export function refToChineseLabel(ref: string | undefined | null): string | null {
  if (!ref) return null;
  const trimmed = ref.trim();

  const range = trimmed.match(/^([A-Za-z0-9]+)\.(\d+)-([A-Za-z0-9]+)\.(\d+)$/);
  if (range) {
    const b1 = range[1].toUpperCase();
    const b2 = range[3].toUpperCase();
    const n1 = bookCn(b1);
    const n2 = bookCn(b2);
    if (b1 === b2) return `${n1} ${range[2]}–${range[4]}章`;
    return `${n1} ${range[2]}章 – ${n2} ${range[4]}章`;
  }

  const verseRange = trimmed.match(/^([A-Za-z0-9]+)\.(\d+)\.(\d+)-(\d+)$/);
  if (verseRange) {
    return formatChapterVerse(
      bookCn(verseRange[1]),
      verseRange[2],
      `${verseRange[3]}-${verseRange[4]}`,
    );
  }

  const osis = normalizeInlineRef(trimmed);
  if (osis) {
    const parsed = osis.match(/^([A-Za-z0-9]+)\.(\d+)(?:\.(\d+))?$/);
    if (parsed) {
      return formatChapterVerse(bookCn(parsed[1]), parsed[2], parsed[3]);
    }
  }

  return trimmed;
}

/** 文本内嵌 USFM 经节（JHN 3:16、GEN.1.1、GEN.2:7）→ 中文 */
const INLINE_REF_TOKEN =
  /\b(?:[1-3][A-Z]{2,3}|[A-Z]{2,4})[.\s]\d+(?:[:.\s]\d+)?\b/g;

/** 将文本内嵌的 USFM 经节（JHN 3:16、GEN.1.1、参考 ROM.3.23）替换为中文 */
export function localizeRefsInText(text: string | undefined | null): string {
  if (!text) return text ?? '';
  return text.replace(INLINE_REF_TOKEN, (match) => refToChineseLabel(match) ?? match);
}

/** 群动态/足迹等场景的统一经文展示 */
export function formatGroupRefLabel(ref: string | undefined | null): string {
  if (!ref) return '';
  return refToChineseLabel(ref) ?? ref;
}

/** OSIS 书卷 id → 中文名（如 GEN → 创世记） */
export function bookIdToChineseName(bookId: string | undefined | null): string {
  if (!bookId) return '';
  return bookCn(bookId);
}
