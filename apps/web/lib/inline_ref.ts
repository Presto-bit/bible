/** 段落标题/注释中的经节引用解析（如 代上1:1、JHN 3:16、马太福音11:28） */

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

const CN_FULL: Record<string, string> = {
  创世记: 'GEN', 出埃及记: 'EXO', 利未记: 'LEV', 民数记: 'NUM', 申命记: 'DEU',
  约书亚记: 'JOS', 士师记: 'JDG', 路得记: 'RUT',
  撒母耳记上: '1SA', 撒母耳记下: '2SA', 列王纪上: '1KI', 列王纪下: '2KI',
  历代志上: '1CH', 历代志下: '2CH',
  以斯拉记: 'EZR', 尼希米记: 'NEH', 以斯帖记: 'EST', 约伯记: 'JOB', 诗篇: 'PSA',
  传道书: 'ECC', 雅歌: 'SNG', 箴言: 'PRO',
  以赛亚书: 'ISA', 耶利米书: 'JER', 耶利米哀歌: 'LAM', 以西结书: 'EZK', 但以理书: 'DAN',
  何西阿书: 'HOS', 约珥书: 'JOL', 阿摩司书: 'AMO', 俄巴底亚书: 'OBA', 约拿书: 'JON',
  弥迦书: 'MIC', 那鸿书: 'NAH', 哈巴谷书: 'HAB', 西番雅书: 'ZEP', 哈该书: 'HAG',
  撒迦利亚书: 'ZEC', 玛拉基书: 'MAL',
  马太福音: 'MAT', 马可福音: 'MRK', 路加福音: 'LUK', 约翰福音: 'JHN', 使徒行传: 'ACT',
  罗马书: 'ROM', 哥林多前书: '1CO', 哥林多后书: '2CO', 加拉太书: 'GAL', 以弗所书: 'EPH',
  腓立比书: 'PHP', 歌罗西书: 'COL',
  帖撒罗尼迦前书: '1TH', 帖撒罗尼迦后书: '2TH',
  提摩太前书: '1TI', 提摩太后书: '2TI', 提多书: 'TIT', 腓利门书: 'PHM',
  希伯来书: 'HEB', 雅各书: 'JAS', 彼得前书: '1PE', 彼得后书: '2PE',
  约翰一书: '1JN', 约翰二书: '2JN', 约翰三书: '3JN', 犹大书: 'JUD', 启示录: 'REV',
};

const CN_ALL: Record<string, string> = { ...CN_FULL, ...CN_ABBR };
const CN_NAMES_SORTED = Object.keys(CN_ALL).sort((a, b) => b.length - a.length);

const FW_MAP: Record<string, string> = {
  '０': '0', '１': '1', '２': '2', '３': '3', '４': '4',
  '５': '5', '６': '6', '７': '7', '８': '8', '９': '9',
  '：': ':', '．': '.', '～': '~', '－': '-', '—': '-', '–': '-',
};

function normalizeRefText(text: string): string {
  return text.replace(/[０-９：．～－—–]/g, (ch) => FW_MAP[ch] ?? ch);
}

function formatOsis(
  book: string,
  chapter: string,
  verseStart?: string,
  verseEnd?: string,
): string {
  if (!verseStart) return `${book}.${chapter}`;
  if (verseEnd && verseEnd !== verseStart) return `${book}.${chapter}.${verseStart}-${verseEnd}`;
  return `${book}.${chapter}.${verseStart}`;
}

function osisFromCnBook(bookId: string, chapter: string, verseStart?: string, verseEnd?: string): string {
  return formatOsis(bookId, chapter, verseStart, verseEnd);
}

function osisCrossChapter(
  bookId: string,
  ch1: string,
  v1: string,
  ch2: string,
  v2: string,
): string {
  if (ch1 === ch2) return formatOsis(bookId, ch1, v1, v2);
  // API 仅支持单段引用；跨章取起始节，完整范围保留在按钮 label
  return formatOsis(bookId, ch1, v1);
}

/** 将常见中文缩写/全名转为 OSIS 书卷 id + 章:节 */
export function normalizeInlineRef(raw: string): string | null {
  const s = normalizeRefText(raw.trim().replace(/[（）()]/g, ''));
  if (!s) return null;

  const osisMatch = s.match(
    /^([A-Za-z0-9]+)[.\s]+(\d+)(?:[:.\s]+(\d+)(?:\s*[-~–—]\s*(\d+))?)?$/,
  );
  if (osisMatch) {
    return formatOsis(
      osisMatch[1].toUpperCase(),
      osisMatch[2],
      osisMatch[3],
      osisMatch[4],
    );
  }

  for (const name of CN_NAMES_SORTED) {
    if (!s.startsWith(name)) continue;
    const tail = s.slice(name.length).trimStart();
    const book = CN_ALL[name];

    const chVerseMatch = tail.match(/^(\d+)章\s*(\d+)\s*(?:至\s*(\d+))?\s*节$/);
    if (chVerseMatch) {
      return osisFromCnBook(book, chVerseMatch[1], chVerseMatch[2], chVerseMatch[3]);
    }

    const crossMatch = tail.match(/^(\d+)[:：](\d+)\s*[-~–—]\s*(\d+)[:：](\d+)/);
    if (crossMatch) {
      return osisCrossChapter(book, crossMatch[1], crossMatch[2], crossMatch[3], crossMatch[4]);
    }

    const verseMatch = tail.match(/^(\d+)[:：](\d+)(?:\s*[-~–—]\s*(\d+))?/);
    if (verseMatch) {
      return osisFromCnBook(book, verseMatch[1], verseMatch[2], verseMatch[3]);
    }

    const chRangeMatch = tail.match(/^(\d+)\s*[-~–—]\s*(\d+)\s*章/);
    if (chRangeMatch) return `${book}.${chRangeMatch[1]}`;

    const chMatch = tail.match(/^(\d+)\s*章/);
    if (chMatch) return `${book}.${chMatch[1]}`;
  }

  const cnMatch = s.match(/^([\u4e00-\u9fff]{1,4})\s*(\d+)[:：](\d+)(?:\s*[-~–—]\s*(\d+))?$/);
  if (cnMatch) {
    const book = CN_ALL[cnMatch[1]];
    if (book) return formatOsis(book, cnMatch[2], cnMatch[3], cnMatch[4]);
  }

  return null;
}

export type InlineRefPart =
  | { kind: 'text'; value: string }
  | { kind: 'ref'; value: string; osis: string | null };

type RefHit = {
  start: number;
  end: number;
  value: string;
  osis: string;
  bookId: string;
  chapter?: string;
};

type RefContext = {
  bookId: string | null;
  chapter: string | null;
};

function canStartBareRef(text: string, index: number): boolean {
  if (index === 0) return true;
  const prev = text[index - 1] ?? '';
  return /[；;，,\s：:、（(）)]/.test(prev);
}

function matchBookRefAt(text: string, index: number): RefHit | null {
  for (const name of CN_NAMES_SORTED) {
    if (!text.startsWith(name, index)) continue;
    const tail = text.slice(index + name.length);
    const bookId = CN_ALL[name];

    const chVerseMatch = tail.match(/^\s*(\d+)章\s*(\d+)\s*(?:至\s*(\d+))?\s*节/);
    if (chVerseMatch) {
      const value = name + chVerseMatch[0];
      return {
        start: index,
        end: index + value.length,
        value,
        osis: osisFromCnBook(bookId, chVerseMatch[1], chVerseMatch[2], chVerseMatch[3]),
        bookId,
        chapter: chVerseMatch[1],
      };
    }

    const crossMatch = tail.match(/^\s*(\d+)[:：](\d+)\s*[-~–—]\s*(\d+)[:：](\d+)/);
    if (crossMatch) {
      const value = name + crossMatch[0];
      return {
        start: index,
        end: index + value.length,
        value,
        osis: osisCrossChapter(bookId, crossMatch[1], crossMatch[2], crossMatch[3], crossMatch[4]),
        bookId,
        chapter: crossMatch[3],
      };
    }

    const verseMatch = tail.match(/^\s*(\d+)[:：](\d+)(?:\s*[-~–—]\s*(\d+))?/);
    if (verseMatch) {
      const value = name + verseMatch[0];
      return {
        start: index,
        end: index + value.length,
        value,
        osis: osisFromCnBook(bookId, verseMatch[1], verseMatch[2], verseMatch[3]),
        bookId,
        chapter: verseMatch[1],
      };
    }

    const chRangeMatch = tail.match(/^\s*(\d+)\s*[-~–—]\s*(\d+)\s*章/);
    if (chRangeMatch) {
      const value = name + chRangeMatch[0];
      return {
        start: index,
        end: index + value.length,
        value,
        osis: `${bookId}.${chRangeMatch[1]}`,
        bookId,
        chapter: chRangeMatch[1],
      };
    }

    const chMatch = tail.match(/^\s*(\d+)\s*章/);
    if (chMatch) {
      const value = name + chMatch[0];
      return {
        start: index,
        end: index + value.length,
        value,
        osis: `${bookId}.${chMatch[1]}`,
        bookId,
        chapter: chMatch[1],
      };
    }
  }

  const enSlice = text.slice(index);
  const enMatch = enSlice.match(/^([0-9]?[A-Za-z]{2,4})\s*(\d+)[:：](\d+)(?:\s*[-~–—]\s*(\d+))?/);
  if (enMatch) {
    const bookId = enMatch[1].toUpperCase();
    const value = enMatch[0];
    return {
      start: index,
      end: index + value.length,
      value,
      osis: formatOsis(bookId, enMatch[2], enMatch[3], enMatch[4]),
      bookId,
      chapter: enMatch[2],
    };
  }

  return null;
}

function matchContinuationAt(text: string, index: number, ctx: RefContext): RefHit | null {
  if (!ctx.bookId || !ctx.chapter) return null;

  const andChapter = text.slice(index).match(/^和\s*(\d+)\s*章/);
  if (andChapter) {
    const value = andChapter[0];
    return {
      start: index,
      end: index + value.length,
      value,
      osis: `${ctx.bookId}.${andChapter[1]}`,
      bookId: ctx.bookId,
      chapter: andChapter[1],
    };
  }

  const commaVerse = text.slice(index).match(/^,\s*(\d+)/);
  if (commaVerse) {
    const value = commaVerse[0];
    return {
      start: index,
      end: index + value.length,
      value,
      osis: osisFromCnBook(ctx.bookId, ctx.chapter, commaVerse[1]),
      bookId: ctx.bookId,
      chapter: ctx.chapter,
    };
  }

  const enumRange = text.slice(index).match(/^、(\d+)(?:\s*[-~–—]\s*(\d+))?/);
  if (enumRange) {
    const value = enumRange[0];
    return {
      start: index,
      end: index + value.length,
      value,
      osis: osisFromCnBook(ctx.bookId, ctx.chapter, enumRange[1], enumRange[2]),
      bookId: ctx.bookId,
      chapter: ctx.chapter,
    };
  }

  return null;
}

function matchBareRefAt(text: string, index: number, ctx: RefContext): RefHit | null {
  if (!ctx.bookId || !canStartBareRef(text, index)) return null;
  const slice = text.slice(index);

  const crossMatch = slice.match(/^(\d+)[:：](\d+)\s*[-~–—]\s*(\d+)[:：](\d+)/);
  if (crossMatch) {
    const value = crossMatch[0];
    return {
      start: index,
      end: index + value.length,
      value,
      osis: osisCrossChapter(ctx.bookId, crossMatch[1], crossMatch[2], crossMatch[3], crossMatch[4]),
      bookId: ctx.bookId,
      chapter: crossMatch[3],
    };
  }

  const m = slice.match(/^(\d+)[:：](\d+)(?:\s*[-~–—]\s*(\d+))?/);
  if (!m) return null;
  const value = m[0];
  return {
    start: index,
    end: index + value.length,
    value,
    osis: osisFromCnBook(ctx.bookId, m[1], m[2], m[3]),
    bookId: ctx.bookId,
    chapter: m[1],
  };
}

/** 将含经节引用的文本拆成可点击片段 */
export function splitInlineRefs(text: string): InlineRefPart[] {
  const normalized = normalizeRefText(text);
  const hits: RefHit[] = [];
  const ctx: RefContext = { bookId: null, chapter: null };
  let i = 0;

  while (i < normalized.length) {
    const bookHit = matchBookRefAt(normalized, i);
    if (bookHit) {
      hits.push(bookHit);
      ctx.bookId = bookHit.bookId;
      ctx.chapter = bookHit.chapter ?? null;
      i = bookHit.end;
      continue;
    }

    if (ctx.bookId) {
      const contHit = matchContinuationAt(normalized, i, ctx);
      if (contHit) {
        hits.push(contHit);
        i = contHit.end;
        continue;
      }

      const bareHit = matchBareRefAt(normalized, i, ctx);
      if (bareHit) {
        hits.push(bareHit);
        ctx.chapter = bareHit.chapter ?? ctx.chapter;
        i = bareHit.end;
        continue;
      }
    }

    i += 1;
  }

  if (!hits.length) return [{ kind: 'text', value: text }];

  const parts: InlineRefPart[] = [];
  let last = 0;
  for (const hit of hits) {
    if (hit.start > last) parts.push({ kind: 'text', value: text.slice(last, hit.start) });
    parts.push({ kind: 'ref', value: text.slice(hit.start, hit.end), osis: hit.osis });
    last = hit.end;
  }
  if (last < text.length) parts.push({ kind: 'text', value: text.slice(last) });
  return parts;
}

/** API 串珠 ref 格式 "JHN 3:16" → OSIS */
export function refSpaceToOsis(ref: string): string {
  const m = ref.trim().match(/^([A-Za-z0-9]+)\s+(\d+):(\d+)/);
  if (m) return `${m[1].toUpperCase()}.${m[2]}.${m[3]}`;
  return ref.replace(/\s+/g, '.');
}
