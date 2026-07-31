// 经卷/章节总结：静态摘要 + localStorage 缓存 + 小爱按需生成。

import { chatStream } from './api';
import { bodyText } from './assistant_format';
import { withBasePath } from './basePath';

/** v3：作废旧版逐章概述格式与截断缓存 */
const CACHE_KEY = 'presto_bible_summaries_v3';
const LEGACY_CACHE_KEYS = ['presto_bible_summaries_v1', 'presto_bible_summaries_v2'];

type CacheMap = Record<string, string>;

const BOOK_SEEDS: Record<string, string> = {
  EXO: '《出埃及记》记述以色列人在埃及为奴、神借摩西施行十灾、过红海得释放，在西奈山与神立约并领受律法。全卷主题是从奴役到救赎，建立属神的百姓。',
  GEN: '《创世记》从创造、堕落、洪水到亚伯拉罕之约，记载族长时代与约瑟下埃及，为出埃及与全本圣经的救赎历史奠基。',
  PSA: '《诗篇》是以色列的祈祷与赞美诗集，涵盖哀歌、感恩、智慧与市场，指向对神的信靠与弥赛亚盼望。',
  MAT: '《马太福音》强调耶稣是应验预言的弥赛亚，呈现天国伦理、神国比喻、受难与复活，并以大使命作结。',
  JHN: '《约翰福音》从「道成肉身」展开，以七件神迹与「我是」宣告显明耶稣的神性，核心信息是信子得永生。',
};

const CHAPTER_SEEDS: Record<string, Record<number, string>> = {
  EXO: {
    1: '以色列人在埃及生养众多却遭压迫，法老下令杀害男婴，为摩西降生与神介入埋下伏笔。',
    2: '摩西出生被保全，成长于王宫却因护同胞杀人逃往米甸，在旷野经历四十年预备。',
    3: '摩西在何烈山见燃烧未坏的荆棘，神自称「我是自有永有的」，差遣他回埃及领百姓出埃及，并赐亚伦为口。',
    14: '法老追逼至红海，神使海水分开，以色列人走干地，埃及军被淹没，显明神拯救大能。',
    20: '在西奈山神向百姓颁布十诫，奠定约中伦理与敬拜秩序的核心。',
  },
  GEN: {
    1: '神六日创造天地万物，照祂形象造人，第七日安息，确立创造之工的美好秩序。',
    3: '蛇引诱夏娃，人违背命令堕落，神宣告救赎应许，并逐出伊甸园。',
  },
  JHN: {
    3: '尼哥底母夜访耶稣，谈从灵生与水与圣灵重生，并出现整本圣经最著名的救恩经节。',
  },
};

let staticBooks: Record<string, string> | null = null;
let staticChapters: Record<string, string> | null = null;
let staticLoadPromise: Promise<void> | null = null;

async function ensureStaticSummaries(): Promise<void> {
  if (staticBooks && staticChapters) return;
  if (staticLoadPromise) return staticLoadPromise;
  staticLoadPromise = (async () => {
    try {
      const [booksRes, chaptersRes] = await Promise.all([
        fetch(withBasePath('/content/summaries/books.json'), { cache: 'force-cache' }),
        fetch(withBasePath('/content/summaries/chapters.json'), { cache: 'force-cache' }),
      ]);
      if (booksRes.ok) {
        const data = (await booksRes.json()) as {
          books?: { book?: string; summary?: string }[];
        };
        const map: Record<string, string> = {};
        for (const row of data.books ?? []) {
          const id = (row.book || '').toUpperCase();
          const s = (row.summary || '').trim();
          if (id && s) map[id] = s;
        }
        staticBooks = map;
      } else {
        staticBooks = {};
      }
      if (chaptersRes.ok) {
        const data = (await chaptersRes.json()) as {
          chapters?: { book?: string; chapter?: number; summary?: string }[];
        };
        const map: Record<string, string> = {};
        for (const row of data.chapters ?? []) {
          const id = (row.book || '').toUpperCase();
          const ch = Number(row.chapter);
          const s = (row.summary || '').trim();
          if (id && ch > 0 && s) map[`${id}.${ch}`] = s;
        }
        staticChapters = map;
      } else {
        staticChapters = {};
      }
    } catch {
      staticBooks = staticBooks ?? {};
      staticChapters = staticChapters ?? {};
    }
  })();
  return staticLoadPromise;
}

function purgeLegacyCaches() {
  if (typeof window === 'undefined') return;
  for (const key of LEGACY_CACHE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

function readCache(): CacheMap {
  if (typeof window === 'undefined') return {};
  purgeLegacyCaches();
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') as CacheMap;
  } catch {
    return {};
  }
}

function writeCache(map: CacheMap) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(map));
}

function bookKey(bookId: string) {
  return `book:${bookId.toUpperCase()}`;
}

function chapterKey(bookId: string, chapter: number) {
  return `ch:${bookId.toUpperCase()}.${chapter}`;
}

/** 旧缓存可能在 token 上限处被截断，检测后强制重生成 */
function looksTruncated(text: string, kind: 'book' | 'chapter'): boolean {
  const t = (text || '').trim();
  if (!t) return true;
  if (/[…⋯]$|\.\.\.$/.test(t)) return true;
  if (/第\s*\d+\s*章[：:]\s*$/.test(t)) return true;
  if (kind === 'book') {
    // 旧版逐章列表格式作废
    if (/各章概述/.test(t) && /第\s*\d+\s*章[：:]/.test(t)) return true;
    // 明显半截：极短且无句号
    if (t.length < 24 && !/[。！？]/.test(t)) return true;
  } else if (t.length < 8) {
    return true;
  }
  return false;
}

function resolveBookSeed(bookId: string): string | null {
  const k = bookId.toUpperCase();
  return staticBooks?.[k] || BOOK_SEEDS[k] || null;
}

function resolveChapterSeed(bookId: string, chapter: number): string | null {
  const k = bookId.toUpperCase();
  return staticChapters?.[`${k}.${chapter}`] || CHAPTER_SEEDS[k]?.[chapter] || null;
}

export function getCachedBookSummary(bookId: string): string | null {
  const cached = readCache()[bookKey(bookId)];
  if (cached && !looksTruncated(cached, 'book')) return cached;
  return BOOK_SEEDS[bookId.toUpperCase()] ?? null;
}

export function getCachedChapterSummary(bookId: string, chapter: number): string | null {
  const k = bookId.toUpperCase();
  const cached = readCache()[chapterKey(k, chapter)];
  if (cached && !looksTruncated(cached, 'chapter')) return cached;
  return CHAPTER_SEEDS[k]?.[chapter] ?? null;
}

export function invalidateSummaryCache(bookId?: string, chapter?: number) {
  const map = readCache();
  if (!bookId) {
    writeCache({});
    return;
  }
  if (chapter != null) {
    delete map[chapterKey(bookId, chapter)];
  } else {
    delete map[bookKey(bookId)];
  }
  writeCache(map);
}

async function streamAsk(
  question: string,
  ref?: string,
  scene: 'summary_chapter' | 'summary_book' = 'summary_chapter',
): Promise<string> {
  let text = '';
  let err: string | null = null;
  await chatStream(
    { ref: ref ?? null, question, mode: 'explain', scene },
    {
      onDelta: (t) => {
        text += t;
      },
      onError: (m) => {
        err = m;
      },
    },
  );
  const body = bodyText(text).trim();
  if (err && !body) throw new Error(err);
  if (!body) throw new Error(err || '小爱暂时没有生成内容，请稍后重试');
  return body;
}

export async function loadBookSummary(bookId: string, bookName: string): Promise<string> {
  await ensureStaticSummaries();
  const key = bookKey(bookId);
  const map = readCache();
  const cached = map[key];
  if (cached && !looksTruncated(cached, 'book')) return cached;

  const seed = resolveBookSeed(bookId);
  if (seed) {
    map[key] = seed;
    writeCache(map);
    return seed;
  }

  try {
    const body = await streamAsk(
      `请为《${bookName}》写整卷导读：卷概览、结构脉络（分段而非逐章）、核心主题与读经提示。不要逐章概述。务必写完整，不要中途截断。`,
      bookId,
      'summary_book',
    );
    if (!looksTruncated(body, 'book')) {
      map[key] = body;
      writeCache(map);
    }
    return body;
  } catch (e) {
    const fallback = resolveBookSeed(bookId);
    if (fallback) return fallback;
    throw e;
  }
}

export async function loadChapterSummary(
  bookId: string,
  bookName: string,
  chapter: number,
): Promise<string> {
  await ensureStaticSummaries();
  const key = chapterKey(bookId, chapter);
  const map = readCache();
  const cached = map[key];
  if (cached && !looksTruncated(cached, 'chapter')) return cached;

  const seed = resolveChapterSeed(bookId, chapter);
  if (seed) {
    map[key] = seed;
    writeCache(map);
    return seed;
  }

  try {
    const body = await streamAsk(
      `请概括《${bookName}》第${chapter}章的核心内容与要点。务必写完整，不要中途截断。`,
      `${bookId}.${chapter}`,
      'summary_chapter',
    );
    if (!looksTruncated(body, 'chapter')) {
      map[key] = body;
      writeCache(map);
    }
    return body;
  } catch (e) {
    const fallback = resolveChapterSeed(bookId, chapter);
    if (fallback) return fallback;
    throw e;
  }
}
