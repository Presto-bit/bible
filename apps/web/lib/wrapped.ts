/** 月/年度读经回顾（§22.3 Wrapped）— 故事卡数据 */

import { bibleChapter } from './bible_client';
import { dailyMinutes, rangeStats, readEvents } from './reading';
import { readingStreak } from './gamification';
import { listNotes } from './notes';
import { loadFavoriteRefs } from './favorites';
import { highlightCount } from './reader_highlights';
import { statsByBook, topColorLabel } from './mark_stats';
import { bookIdToChineseName, refToChineseLabel } from './ref_label';
import { parseMarkRef } from './mark_ref';

export type WrappedPeriod = 'month' | 'year';

export type WrappedSlideKind =
  | 'cover'
  | 'time'
  | 'rhythm'
  | 'scripture'
  | 'book'
  | 'verse'
  | 'quotes'
  | 'marks'
  | 'close';

export type WrappedShareTemplate = 'verse' | 'footprint' | 'book';

export type WrappedVerseQuote = {
  ref: string;
  label: string;
  text?: string;
};

export type WrappedDaypart = 'morning' | 'afternoon' | 'evening' | 'night';

export type WrappedSlide = {
  kind: WrappedSlideKind;
  kicker: string;
  title: string;
  body?: string;
  metrics?: { value: string; label: string }[];
  /** 壁纸 day（1–31，对齐 daily-wallpapers） */
  wallpaperDay: number;
  /** 经文屏 / 金句屏 */
  verse?: WrappedVerseQuote;
  quotes?: WrappedVerseQuote[];
};

export interface WrappedStats {
  period: WrappedPeriod;
  label: string;
  shortLabel: string;
  totalMinutes: number;
  activeDays: number;
  chapters: number;
  streak: number;
  notesCount: number;
  favoritesCount: number;
  marksCount: number;
  prayers: number;
  topBookId?: string;
  topBookName?: string;
  topMarkColorLabel?: string;
  highlight: string;
  yearVerse?: WrappedVerseQuote;
  quotes: WrappedVerseQuote[];
  daypart?: WrappedDaypart;
  daypartLabel?: string;
  slides: WrappedSlide[];
  /** 默认可选分享模板 */
  defaultShareTemplate: WrappedShareTemplate;
}

const DAYPART_LABEL: Record<WrappedDaypart, string> = {
  morning: '清晨',
  afternoon: '白昼',
  evening: '傍晚',
  night: '夜里',
};

const DAYPART_BODY: Record<WrappedDaypart, string> = {
  morning: '你常在晨光里打开话语',
  afternoon: '你在白昼中与话语同行',
  evening: '你常在傍晚停下脚步默想',
  night: '夜里安静时，你仍与话语相遇',
};

/** 按书卷气质选壁纸 day */
export function bookThemeDay(bookId?: string): number {
  if (!bookId) return 21;
  const id = bookId.toUpperCase();
  if (['PSA', 'JOB', 'PRO', 'ECC', 'SNG', 'LAM'].includes(id)) return 3;
  if (['MAT', 'MRK', 'LUK', 'JHN'].includes(id)) return 12;
  if (['ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL', 'HEB', 'JAS', '1PE', '1JN'].includes(id))
    return 22;
  if (['GEN', 'EXO', 'JOS', 'RUT', 'EST', 'JON', 'DAN'].includes(id)) return 15;
  if (id === 'REV') return 28;
  return 18;
}

export function wrappedShareTemplates(w: WrappedStats): {
  id: WrappedShareTemplate;
  label: string;
}[] {
  const out: { id: WrappedShareTemplate; label: string }[] = [
    { id: 'footprint', label: '足迹卡' },
  ];
  if (w.yearVerse) out.unshift({ id: 'verse', label: '经文海报' });
  if (w.topBookName) out.push({ id: 'book', label: '书卷印象' });
  return out;
}

function periodRange(period: WrappedPeriod): {
  start: number;
  end: number;
  label: string;
  shortLabel: string;
} {
  const now = new Date();
  if (period === 'year') {
    const y = now.getFullYear();
    return {
      start: new Date(y, 0, 1).getTime(),
      end: new Date(y + 1, 0, 1).getTime(),
      label: `${y} 年度回顾`,
      shortLabel: `${y}`,
    };
  }
  const y = now.getFullYear();
  const m = now.getMonth();
  return {
    start: new Date(y, m, 1).getTime(),
    end: new Date(y, m + 1, 1).getTime(),
    label: `${y} 年 ${m + 1} 月回顾`,
    shortLabel: `${m + 1} 月`,
  };
}

function formatMinutes(mins: number): string {
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h} 小时 ${m} 分` : `${h} 小时`;
  }
  return `${mins} 分钟`;
}

function quoteFromRef(ref: string): WrappedVerseQuote | null {
  const label = refToChineseLabel(ref);
  if (!label) return null;
  return { ref, label };
}

function detectDaypart(start: number, end: number): { daypart: WrappedDaypart; count: number } | null {
  const buckets: Record<WrappedDaypart, number> = {
    morning: 0,
    afternoon: 0,
    evening: 0,
    night: 0,
  };
  let total = 0;
  for (const e of readEvents()) {
    if (e.ts < start || e.ts >= end) continue;
    total += 1;
    const h = new Date(e.ts).getHours();
    if (h >= 5 && h < 11) buckets.morning += 1;
    else if (h >= 11 && h < 17) buckets.afternoon += 1;
    else if (h >= 17 && h < 22) buckets.evening += 1;
    else buckets.night += 1;
  }
  if (total < 3) return null;
  let best: WrappedDaypart = 'morning';
  let bestN = -1;
  (Object.keys(buckets) as WrappedDaypart[]).forEach((k) => {
    if (buckets[k] > bestN) {
      bestN = buckets[k];
      best = k;
    }
  });
  return { daypart: best, count: bestN };
}

function buildHighlight(opts: {
  period: WrappedPeriod;
  activeDays: number;
  chapters: number;
  marksCount: number;
  topMarkColorLabel?: string;
  topBookName?: string;
  yearVerseLabel?: string;
  daypartLabel?: string;
}): string {
  const {
    period,
    activeDays,
    chapters,
    marksCount,
    topMarkColorLabel,
    topBookName,
    yearVerseLabel,
    daypartLabel,
  } = opts;
  const span = period === 'year' ? '今年' : '这个月';
  if (yearVerseLabel) return `${span}与你同行的一节：${yearVerseLabel}`;
  if (topBookName && chapters >= 10) return `${span}你常在《${topBookName}》停留`;
  if (daypartLabel) return `${span}你偏爱${daypartLabel}读经`;
  if (marksCount >= 50) {
    return topMarkColorLabel
      ? `${span}你标记了 ${marksCount} 处经文，以「${topMarkColorLabel}」最多`
      : `${span}你标记了 ${marksCount} 处经文，记忆深刻`;
  }
  if (activeDays >= 20) return '你是持之以恒的读经伙伴';
  if (activeDays >= 7) return `${span}你留下了稳定的足迹`;
  if (chapters > 0) return `读了 ${chapters} 章，每一步都算数`;
  return '新的开始，从一节经文就好';
}

export function buildWrapped(period: WrappedPeriod): WrappedStats {
  const { start, end, label, shortLabel } = periodRange(period);
  const stats = rangeStats(start, end);
  const mins = dailyMinutes();
  let totalMinutes = 0;
  let activeDays = 0;
  for (const [date, m] of Object.entries(mins)) {
    const t = new Date(`${date}T00:00:00`).getTime();
    if (t >= start && t < end && m > 0) {
      totalMinutes += m;
      activeDays += 1;
    }
  }
  const streak = readingStreak();
  const notesCount = listNotes().filter((n) => n.updatedAt >= start && n.updatedAt < end).length;
  const favoritesCount = loadFavoriteRefs().length;
  const marksCount = highlightCount();
  const byBook = statsByBook();
  const topFromMarks = byBook[0]?.bookId;
  const topFromRead = stats.topBooks[0]?.key;
  const topBookId = topFromRead || topFromMarks;
  const topBookName = topBookId ? bookIdToChineseName(topBookId) : undefined;
  const topMarkColorLabel = topColorLabel() || undefined;
  const chapters = stats.chapters;

  const quotes = stats.topVerses
    .map((v) => quoteFromRef(v.key))
    .filter((q): q is WrappedVerseQuote => Boolean(q))
    .slice(0, 3);
  const yearVerse = quotes[0];
  const daypartInfo = detectDaypart(start, end);
  const daypart = daypartInfo?.daypart;
  const daypartLabel = daypart ? DAYPART_LABEL[daypart] : undefined;

  const highlight = buildHighlight({
    period,
    activeDays,
    chapters,
    marksCount,
    topMarkColorLabel,
    topBookName,
    yearVerseLabel: yearVerse?.label,
    daypartLabel,
  });

  const spanWord = period === 'year' ? '这一年' : '这个月';
  const coverDay = period === 'year' ? 21 : 14;
  const slides: WrappedSlide[] = [
    {
      kind: 'cover',
      kicker: label,
      title: highlight,
      body: '滑动查看你的读经足迹',
      wallpaperDay: coverDay,
    },
    {
      kind: 'time',
      kicker: `${spanWord}，你把时间给了话语`,
      title: formatMinutes(totalMinutes),
      body: activeDays > 0 ? `分布在 ${activeDays} 个活跃的日子里` : '从今天起，留下第一分钟',
      metrics: [
        { value: String(totalMinutes), label: '分钟' },
        { value: String(activeDays), label: '活跃天' },
      ],
      wallpaperDay: 5,
    },
  ];

  if (streak > 0 || daypart) {
    slides.push({
      kind: 'rhythm',
      kicker: '节奏',
      title: daypartLabel
        ? `偏爱${daypartLabel}`
        : streak > 0
          ? `连续 ${streak} 天`
          : '从今天接上节奏',
      body: daypart
        ? DAYPART_BODY[daypart]
        : streak >= 7
          ? '不是比拼，是陪伴——你让读经成为日常'
          : '轻轻继续就好，不需要赶',
      metrics: [
        ...(streak > 0 ? [{ value: String(streak), label: '连续天' }] : []),
        ...(daypartLabel ? [{ value: daypartLabel, label: '常读时段' }] : []),
      ],
      wallpaperDay: 9,
    });
  }

  if (chapters > 0) {
    slides.push({
      kind: 'scripture',
      kicker: '足迹',
      title: `${chapters} 章`,
      body: topBookName ? `常读《${topBookName}》` : '一卷一卷，慢慢走进故事',
      metrics: [
        { value: String(chapters), label: '章' },
        ...(topBookName ? [{ value: topBookName, label: '常读卷' }] : []),
      ],
      wallpaperDay: 11,
    });
  }

  if (topBookName && topBookId) {
    slides.push({
      kind: 'book',
      kicker: period === 'year' ? '书卷印象' : '本月印象',
      title: `《${topBookName}》`,
      body:
        chapters >= 10
          ? `${spanWord}你常在这里停留，像回到一处熟悉的地方`
          : `${spanWord}你在这里留下了足迹`,
      wallpaperDay: bookThemeDay(topBookId),
    });
  }

  if (yearVerse) {
    slides.push({
      kind: 'verse',
      kicker: period === 'year' ? '年度经文' : '本月经文',
      title: yearVerse.label,
      body: '加载经文中…',
      verse: yearVerse,
      wallpaperDay: bookThemeDay(parseMarkRef(yearVerse.ref)?.bookId || topBookId),
    });
  }

  if (quotes.length >= 2) {
    slides.push({
      kind: 'quotes',
      kicker: '金句',
      title: `${spanWord}与你相遇的经文`,
      body: '收藏、划线与阅读，一起留下这些句子',
      quotes,
      wallpaperDay: 18,
    });
  }

  if (marksCount > 0 || notesCount > 0 || stats.prayers > 0) {
    slides.push({
      kind: 'marks',
      kicker: '留下的痕迹',
      title: marksCount > 0 || notesCount > 0 ? '你把感动记了下来' : '祷告也算在足迹里',
      body: [
        marksCount > 0 ? `${marksCount} 处划线` : null,
        notesCount > 0 ? `${notesCount} 条笔记` : null,
        favoritesCount > 0 ? `${favoritesCount} 处收藏` : null,
        stats.prayers > 0 ? `${stats.prayers} 次祷告` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      metrics: [
        { value: String(marksCount), label: '划线' },
        { value: String(notesCount), label: '笔记' },
      ],
      wallpaperDay: 16,
    });
  }

  slides.push({
    kind: 'close',
    kicker: BRAND_CLOSE_KICKER,
    title: period === 'year' ? '愿来年仍在话语中相遇' : '愿下个月仍安静同行',
    body: '选一张海报，把足迹分享给朋友',
    wallpaperDay: 28,
  });

  return {
    period,
    label,
    shortLabel,
    totalMinutes,
    activeDays,
    chapters,
    streak,
    notesCount,
    favoritesCount,
    marksCount,
    prayers: stats.prayers,
    topBookId,
    topBookName,
    topMarkColorLabel,
    highlight,
    yearVerse,
    quotes,
    daypart,
    daypartLabel,
    slides,
    defaultShareTemplate: yearVerse ? 'verse' : 'footprint',
  };
}

const BRAND_CLOSE_KICKER = '彼爱 · 读经回顾';

async function fetchVerseText(ref: string): Promise<string | undefined> {
  const p = parseMarkRef(ref);
  if (!p || p.verseStart == null) return undefined;
  try {
    const verses = await bibleChapter(p.bookId, p.chapter);
    const hit = verses?.find((v) => v.verse === p.verseStart);
    return hit?.text?.trim() || undefined;
  } catch {
    return undefined;
  }
}

/** 异步补全年度经文 / 金句正文 */
export async function enrichWrappedTexts(w: WrappedStats): Promise<WrappedStats> {
  const refs = [...new Set([w.yearVerse?.ref, ...w.quotes.map((q) => q.ref)].filter(Boolean))] as string[];
  if (refs.length === 0) return w;

  const pairs = await Promise.all(
    refs.map(async (ref) => [ref, await fetchVerseText(ref)] as const),
  );
  const textMap = new Map(pairs);

  const patchQuote = (q: WrappedVerseQuote): WrappedVerseQuote => ({
    ...q,
    text: textMap.get(q.ref) || q.text,
  });

  const yearVerse = w.yearVerse ? patchQuote(w.yearVerse) : undefined;
  const quotes = w.quotes.map(patchQuote);
  const slides = w.slides.map((s) => {
    if (s.kind === 'verse' && s.verse) {
      const verse = patchQuote(s.verse);
      return {
        ...s,
        verse,
        title: verse.text ? `「${trimQuote(verse.text, 42)}」` : verse.label,
        body: verse.text ? verse.label : '打开圣经，读一读这节经文',
      };
    }
    if (s.kind === 'quotes' && s.quotes) {
      return { ...s, quotes: s.quotes.map(patchQuote) };
    }
    return s;
  });

  return { ...w, yearVerse, quotes, slides };
}

function trimQuote(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if ([...t].length <= max) return t;
  return `${[...t].slice(0, max).join('')}…`;
}

/** 分享文案（不含链接） */
export function wrappedShareText(w: WrappedStats, template: WrappedShareTemplate = w.defaultShareTemplate): string {
  if (template === 'verse' && w.yearVerse) {
    const text = w.yearVerse.text ? `「${w.yearVerse.text}」\n` : '';
    return `${w.label}\n${text}${w.yearVerse.label}`;
  }
  if (template === 'book' && w.topBookName) {
    return `${w.label}\n${w.period === 'year' ? '今年' : '这个月'}常在《${w.topBookName}》\n${w.highlight}`;
  }
  const stats = [
    `活跃 ${w.activeDays} 天`,
    `阅读 ${w.totalMinutes} 分钟`,
    w.chapters > 0 ? `${w.chapters} 章` : null,
    `连续 ${w.streak} 天`,
  ]
    .filter(Boolean)
    .join(' · ');
  return `${w.label}\n${w.highlight}\n${stats}`;
}

export function wrappedShareStatsLine(w: WrappedStats): string {
  return [
    `活跃 ${w.activeDays} 天`,
    `阅读 ${w.totalMinutes} 分钟`,
    `连续 ${w.streak} 天`,
    w.chapters > 0 ? `${w.chapters} 章` : null,
    w.notesCount > 0 ? `笔记 ${w.notesCount}` : null,
    w.marksCount > 0 ? `划线 ${w.marksCount}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
