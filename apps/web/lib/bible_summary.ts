// 经卷/章节总结：静态种子 + localStorage 缓存 + 小爱按需生成。

import { chatStream } from './api';
import { bodyText } from './assistant_format';

const CACHE_KEY = 'presto_bible_summaries_v1';

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

function readCache(): CacheMap {
  if (typeof window === 'undefined') return {};
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

export function getCachedBookSummary(bookId: string): string | null {
  return readCache()[bookKey(bookId)] ?? BOOK_SEEDS[bookId.toUpperCase()] ?? null;
}

export function getCachedChapterSummary(bookId: string, chapter: number): string | null {
  const k = bookId.toUpperCase();
  return readCache()[chapterKey(k, chapter)] ?? CHAPTER_SEEDS[k]?.[chapter] ?? null;
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
  if (err && !text.trim()) throw new Error(err);
  return bodyText(text);
}

export async function loadBookSummary(bookId: string, bookName: string): Promise<string> {
  const cached = getCachedBookSummary(bookId);
  if (cached && readCache()[bookKey(bookId)]) return cached;

  const seed = BOOK_SEEDS[bookId.toUpperCase()];
  if (seed) {
    const map = readCache();
    map[bookKey(bookId)] = seed;
    writeCache(map);
    return seed;
  }

  const body = await streamAsk(
    `请概括《${bookName}》整卷的主旨、结构与核心主题。`,
    bookId,
    'summary_book',
  );
  const map = readCache();
  map[bookKey(bookId)] = body;
  writeCache(map);
  return body;
}

export async function loadChapterSummary(
  bookId: string,
  bookName: string,
  chapter: number,
): Promise<string> {
  const cached = getCachedChapterSummary(bookId, chapter);
  if (cached && readCache()[chapterKey(bookId, chapter)]) return cached;

  const seed = CHAPTER_SEEDS[bookId.toUpperCase()]?.[chapter];
  if (seed) {
    const map = readCache();
    map[chapterKey(bookId, chapter)] = seed;
    writeCache(map);
    return seed;
  }

  const body = await streamAsk(
    `请概括《${bookName}》第${chapter}章的核心内容与要点。`,
    `${bookId}.${chapter}`,
    'summary_chapter',
  );
  const map = readCache();
  map[chapterKey(bookId, chapter)] = body;
  writeCache(map);
  return body;
}
