/** 月/年度读经回顾（§22.3 Wrapped）— 故事卡数据 */

import { dailyMinutes, rangeStats } from './reading';
import { readingStreak } from './gamification';
import { listNotes } from './notes';
import { loadFavoriteRefs } from './favorites';
import { highlightCount } from './reader_highlights';
import { statsByBook, topColorLabel } from './mark_stats';
import { bookIdToChineseName } from './ref_label';

export type WrappedPeriod = 'month' | 'year';

export type WrappedSlideKind =
  | 'cover'
  | 'time'
  | 'rhythm'
  | 'scripture'
  | 'marks'
  | 'close';

export type WrappedSlide = {
  kind: WrappedSlideKind;
  kicker: string;
  title: string;
  body?: string;
  /** 大数字展示 */
  metrics?: { value: string; label: string }[];
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
  slides: WrappedSlide[];
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

function buildHighlight(opts: {
  period: WrappedPeriod;
  activeDays: number;
  chapters: number;
  marksCount: number;
  topMarkColorLabel?: string;
  topBookName?: string;
}): string {
  const { period, activeDays, chapters, marksCount, topMarkColorLabel, topBookName } = opts;
  const span = period === 'year' ? '今年' : '这个月';
  if (marksCount >= 50) {
    return topMarkColorLabel
      ? `${span}你标记了 ${marksCount} 处经文，以「${topMarkColorLabel}」最多`
      : `${span}你标记了 ${marksCount} 处经文，记忆深刻`;
  }
  if (topBookName && chapters >= 10) {
    return `${span}你常在《${topBookName}》停留`;
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
  const highlight = buildHighlight({
    period,
    activeDays,
    chapters,
    marksCount,
    topMarkColorLabel,
    topBookName,
  });

  const spanWord = period === 'year' ? '这一年' : '这个月';
  const slides: WrappedSlide[] = [
    {
      kind: 'cover',
      kicker: label,
      title: highlight,
      body: '滑动查看你的读经足迹',
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
    },
    {
      kind: 'rhythm',
      kicker: '节奏',
      title: streak > 0 ? `连续 ${streak} 天` : '从今天接上节奏',
      body:
        streak >= 7
          ? '不是比拼，是陪伴——你让读经成为日常'
          : '轻轻继续就好，不需要赶',
      metrics: [{ value: String(streak), label: '连续天' }],
    },
    {
      kind: 'scripture',
      kicker: '足迹',
      title: chapters > 0 ? `${chapters} 章` : '下一章在等你',
      body: topBookName
        ? `常读《${topBookName}》`
        : chapters > 0
          ? '一卷一卷，慢慢走进故事'
          : '打开圣经 Tab，从一章开始',
      metrics: [
        { value: String(chapters), label: '章' },
        ...(topBookName ? [{ value: topBookName, label: '常读卷' }] : []),
      ],
    },
    {
      kind: 'marks',
      kicker: '留下的痕迹',
      title: marksCount > 0 || notesCount > 0 ? '你把感动记了下来' : '下次划一笔就好',
      body:
        marksCount > 0 || notesCount > 0
          ? [
              marksCount > 0 ? `${marksCount} 处划线` : null,
              notesCount > 0 ? `${notesCount} 条笔记` : null,
              stats.prayers > 0 ? `${stats.prayers} 次祷告` : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : '划线与笔记，只属于你自己',
      metrics: [
        { value: String(marksCount), label: '划线' },
        { value: String(notesCount), label: '笔记' },
      ],
    },
    {
      kind: 'close',
      kicker: BRAND_CLOSE_KICKER,
      title: period === 'year' ? '愿来年仍在话语中相遇' : '愿下个月仍安静同行',
      body: '生成一张图，把足迹分享给朋友',
    },
  ];

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
    slides,
  };
}

const BRAND_CLOSE_KICKER = '彼爱 · 读经回顾';

/** 分享文案（不含链接） */
export function wrappedShareText(w: WrappedStats): string {
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
