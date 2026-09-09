/** 诗体平行行/阶梯体（poetry_lines.json，§7.3）。 */

type PoetryLinesPayload = {
  schema?: string;
  verses?: Record<string, string[]>;
};

let cache: Record<string, string[]> | null = null;
let loadPromise: Promise<Record<string, string[]>> | null = null;

function verseKey(bookId: string, chapter: number, verse: number): string {
  return `${bookId.toUpperCase()}.${chapter}.${verse}`;
}

async function loadPoetryLinesIndex(): Promise<Record<string, string[]>> {
  if (cache) return cache;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const { api } = await import('@/lib/api');
      const data = (await api.poetryLines()) as PoetryLinesPayload;
      cache = data.verses ?? {};
      return cache;
    } catch {
      cache = {};
      return cache;
    }
  })();
  return loadPromise;
}

export function preloadPoetryLines(): void {
  void loadPoetryLinesIndex();
}

export function invalidatePoetryLinesCache(): void {
  cache = null;
  loadPromise = null;
}

export function poetryLinesForVerse(
  bookId: string,
  chapter: number,
  verse: number,
): string[] | null {
  if (!cache) return null;
  const lines = cache[verseKey(bookId, chapter, verse)];
  return lines?.length ? lines : null;
}

export async function poetryLinesForVerseAsync(
  bookId: string,
  chapter: number,
  verse: number,
): Promise<string[] | null> {
  const idx = await loadPoetryLinesIndex();
  const lines = idx[verseKey(bookId, chapter, verse)];
  return lines?.length ? lines : null;
}
