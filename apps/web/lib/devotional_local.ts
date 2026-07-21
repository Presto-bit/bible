/** 创世记 50 次同行：本地续读与默想草稿 */

export const GENESIS_50_SERIES_ID = 'genesis_50_walk';
export const GENESIS_50_DEFAULT_DAY = 7;

const progressKey = (seriesId: string) => `devotional:${seriesId}:progress`;
const draftKey = (seriesId: string, day: number) => `devotional:${seriesId}:draft:${day}`;

export type DevotionalTab = 'scripture' | 'letter' | 'workbook';

export type LocalProgress = {
  day: number;
  tab: DevotionalTab;
  updatedAt: number;
};

export type WorkbookDraft = {
  answers: string[];
  practiceIndex: number | null;
  practiceNote: string;
  updatedAt: number;
};

export const TAB_LABELS: Record<DevotionalTab, string> = {
  scripture: '经文',
  letter: '灵修书信',
  workbook: '默想教材',
};

export const CHECKIN_EMOJI_OPTIONS = [
  { emoji: '🙏', label: '祷告' },
  { emoji: '❤️', label: '感恩' },
  { emoji: '👍', label: '认同' },
  { emoji: '🙌', label: '赞美' },
  { emoji: '💪', label: '愿意行动' },
] as const;

export const CHECKIN_EMOJIS = CHECKIN_EMOJI_OPTIONS.map((o) => o.emoji);

export function tabLabel(tab?: string | null): string {
  if (tab === 'letter') return TAB_LABELS.letter;
  if (tab === 'workbook') return TAB_LABELS.workbook;
  return TAB_LABELS.scripture;
}

export function readLocalProgress(seriesId: string): LocalProgress | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(progressKey(seriesId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalProgress;
    if (!parsed?.day) return null;
    return {
      day: Math.min(50, Math.max(1, Number(parsed.day) || GENESIS_50_DEFAULT_DAY)),
      tab: (['scripture', 'letter', 'workbook'] as DevotionalTab[]).includes(parsed.tab)
        ? parsed.tab
        : 'scripture',
      updatedAt: Number(parsed.updatedAt) || Date.now(),
    };
  } catch {
    return null;
  }
}

export function writeLocalProgress(seriesId: string, day: number, tab: DevotionalTab) {
  if (typeof window === 'undefined') return;
  const payload: LocalProgress = { day, tab, updatedAt: Date.now() };
  localStorage.setItem(progressKey(seriesId), JSON.stringify(payload));
}

export function resolveEntryDay(opts: {
  queryDay?: number | null;
  remoteLastDay?: number | null;
  hasOpened?: boolean;
  defaultDay?: number;
  seriesId?: string;
}): number {
  const seriesId = opts.seriesId || GENESIS_50_SERIES_ID;
  if (opts.queryDay && opts.queryDay >= 1 && opts.queryDay <= 50) return opts.queryDay;
  const local = readLocalProgress(seriesId);
  if (local?.day) return local.day;
  if (opts.hasOpened && opts.remoteLastDay) return opts.remoteLastDay;
  return opts.defaultDay || GENESIS_50_DEFAULT_DAY;
}

export function readWorkbookDraft(seriesId: string, day: number): WorkbookDraft {
  const empty: WorkbookDraft = {
    answers: ['', ''],
    practiceIndex: null,
    practiceNote: '',
    updatedAt: 0,
  };
  if (typeof window === 'undefined') return empty;
  try {
    const raw = localStorage.getItem(draftKey(seriesId, day));
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as WorkbookDraft;
    return {
      answers: Array.isArray(parsed.answers) ? parsed.answers : ['', ''],
      practiceIndex: typeof parsed.practiceIndex === 'number' ? parsed.practiceIndex : null,
      practiceNote: parsed.practiceNote || '',
      updatedAt: Number(parsed.updatedAt) || 0,
    };
  } catch {
    return empty;
  }
}

export function writeWorkbookDraft(seriesId: string, day: number, draft: WorkbookDraft) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(
    draftKey(seriesId, day),
    JSON.stringify({ ...draft, updatedAt: Date.now() }),
  );
}

export function formatParticipants(n: number): string {
  if (n <= 0) return '一起开始';
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, '')} 万人正在同行`;
  return `${n.toLocaleString()} 人正在同行`;
}
