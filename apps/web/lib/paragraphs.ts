// 段落分组：对齐微读——散文多节合并为一段，诗体逐节；节号内嵌于段内。

export interface VerseLine {
  verse: number;
  text: string;
}

export interface VerseParagraph {
  startVerse: number;
  endVerse: number;
  verses: VerseLine[];
}

const POETRY_BOOKS = new Set([
  'PSA', 'PRO', 'ECC', 'SNG', 'LAM', 'AMO', 'MIC', 'HAB', 'ZEP', 'NAH',
  'HAG', 'ZEC', 'MAL', 'JOB',
]);

export function isPoetryBook(bookId: string): boolean {
  return POETRY_BOOKS.has(bookId.toUpperCase());
}

function endsSentence(text: string): boolean {
  return /[。！？；….!?;:]["'」』)]*$/.test(text.trim());
}

/** 将一章经节分组为段落（微读式连续段落）。 */
export function groupVersesIntoParagraphs(
  bookId: string,
  verses: VerseLine[],
  sectionStarts: number[] = [],
): VerseParagraph[] {
  if (!verses.length) return [];
  const sections = new Set(sectionStarts);
  const poetry = isPoetryBook(bookId);

  if (poetry) {
    return verses.map((v) => ({
      startVerse: v.verse,
      endVerse: v.verse,
      verses: [v],
    }));
  }

  const out: VerseParagraph[] = [];
  let buf: VerseLine[] = [];

  const flush = () => {
    if (!buf.length) return;
    out.push({
      startVerse: buf[0].verse,
      endVerse: buf[buf.length - 1].verse,
      verses: buf,
    });
    buf = [];
  };

  for (const v of verses) {
    if (sections.has(v.verse) && buf.length) flush();
    if (buf.length > 0) {
      const prev = buf[buf.length - 1];
      const breakHere =
        endsSentence(prev.text) ||
        buf.length >= 5 ||
        (buf.length >= 3 && prev.text.length > 40 && endsSentence(prev.text));
      if (breakHere) flush();
    }
    buf.push(v);
  }
  flush();
  return out;
}
