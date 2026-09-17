/** 非读经类活动日计数（祷告/听读/书架/示意卡/知识库），供报告第 4 格与 rangeStats。 */

import { userLsGet, userLsSet } from './user_storage';
import type { ProductEventName } from './product_events';

export type ActivityDay = {
  prayers: number;
  listen_minutes: number;
  shelf_checkins: number;
  shelf_posts: number;
  visual_cards: number;
  knowledge_steps: number;
};

const KEY = 'presto_activity_log';

const EMPTY_DAY = (): ActivityDay => ({
  prayers: 0,
  listen_minutes: 0,
  shelf_checkins: 0,
  shelf_posts: 0,
  visual_cards: 0,
  knowledge_steps: 0,
});

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function readAll(): Record<string, ActivityDay> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = JSON.parse(userLsGet(KEY) || '{}') as Record<string, Partial<ActivityDay>>;
    const out: Record<string, ActivityDay> = {};
    for (const [day, row] of Object.entries(raw)) {
      out[day] = {
        prayers: row.prayers ?? 0,
        listen_minutes: row.listen_minutes ?? 0,
        shelf_checkins: row.shelf_checkins ?? 0,
        shelf_posts: row.shelf_posts ?? 0,
        visual_cards: row.visual_cards ?? 0,
        knowledge_steps: row.knowledge_steps ?? 0,
      };
    }
    return out;
  } catch {
    return {};
  }
}

function writeAll(m: Record<string, ActivityDay>) {
  userLsSet(KEY, JSON.stringify(m));
}

function bumpDay(field: keyof ActivityDay, delta: number) {
  if (delta <= 0 || typeof window === 'undefined') return;
  const day = ymd(new Date());
  const all = readAll();
  const cur = all[day] ?? EMPTY_DAY();
  const next = { ...cur, [field]: cur[field] + delta };
  all[day] = next;
  writeAll(all);
  void import('./activity_log_sync').then((m) => m.pushActivityLogDay(day, next));
}

function track(event: ProductEventName, props: Record<string, unknown>, onceSalt?: string) {
  void import('./product_events').then((m) =>
    m.trackProductEvent(event, {
      props,
      oncePerDay: Boolean(onceSalt),
      onceSalt,
    }),
  );
}

export function activityTotalsInRange(startMs: number, endMs: number): ActivityDay {
  const out = EMPTY_DAY();
  for (const [date, row] of Object.entries(readAll())) {
    const t = new Date(`${date}T00:00:00`).getTime();
    if (t < startMs || t >= endMs) continue;
    out.prayers += row.prayers;
    out.listen_minutes += row.listen_minutes;
    out.shelf_checkins += row.shelf_checkins;
    out.shelf_posts += row.shelf_posts;
    out.visual_cards += row.visual_cards;
    out.knowledge_steps += row.knowledge_steps;
  }
  return out;
}

export function logActivityPrayer(opts?: { flow_id?: string; plan_id?: string }) {
  bumpDay('prayers', 1);
  track('prayer_finish', {
    flow_id: opts?.flow_id,
    plan_id: opts?.plan_id,
  });
}

export function logListenOpen(book: string, chapter: number) {
  track(
    'listen_open',
    { book, chapter },
    `listen_open:${book}:${chapter}`,
  );
}

export function logListenSessionEnd(opts: {
  book: string;
  chapter: number;
  minutes: number;
  completed?: boolean;
}) {
  const mins = Math.max(0, Math.round(opts.minutes));
  if (mins > 0) {
    bumpDay('listen_minutes', mins);
    void import('./reading').then((m) => m.bumpReadingMinutes(mins));
  }
  track('listen_session_end', {
    book: opts.book,
    chapter: opts.chapter,
    minutes: mins,
    completed: Boolean(opts.completed),
    source: 'listen',
  });
}

export function logShelfOpen(bookId: string, hasProgress: boolean) {
  track(
    'shelf_open',
    { book_id: bookId, has_progress: hasProgress },
    `shelf_open:${bookId}`,
  );
}

export function logShelfCheckin(bookId: string, sectionId?: string) {
  bumpDay('shelf_checkins', 1);
  track('shelf_checkin', {
    book_id: bookId,
    section_id: sectionId,
  });
}

export function logShelfPost(bookId: string, kind: string) {
  bumpDay('shelf_posts', 1);
  track('shelf_post', { book_id: bookId, kind });
}

export function logVisualCardView(cardId: string, mode: 'half' | 'full' | 'link' = 'link') {
  bumpDay('visual_cards', 1);
  track(
    'visual_card_view',
    { card_id: cardId, mode },
    `visual_card:${cardId}:${mode}`,
  );
}

export function logKnowledgeStep(kind: string, id: string, step: number, total: number) {
  bumpDay('knowledge_steps', 1);
  track('knowledge_step', {
    kind,
    id,
    step,
    total,
  });
}

export type ReportFourthTile =
  | { kind: 'metric'; value: number; unit: string; label: string }
  | { kind: 'cta'; title: string; sub: string; href: string };

/** 报告第 4 格：听读分钟 > 祷告 > 书架打卡 > 示意卡 > 知识库 > CTA */
export function pickReportFourthTile(activity: ActivityDay): ReportFourthTile {
  if (activity.listen_minutes > 0) {
    return { kind: 'metric', value: activity.listen_minutes, unit: '分钟', label: '听读' };
  }
  if (activity.prayers > 0) {
    return { kind: 'metric', value: activity.prayers, unit: '次', label: '祷告打卡' };
  }
  if (activity.shelf_checkins > 0) {
    return { kind: 'metric', value: activity.shelf_checkins, unit: '次', label: '书架打卡' };
  }
  if (activity.visual_cards > 0) {
    return { kind: 'metric', value: activity.visual_cards, unit: '张', label: '示意卡' };
  }
  if (activity.knowledge_steps > 0) {
    return { kind: 'metric', value: activity.knowledge_steps, unit: '步', label: '知识导览' };
  }
  return { kind: 'cta', title: '去祷告', sub: '开始第一次', href: '/pray' };
}
