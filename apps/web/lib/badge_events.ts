/** 成就埋点与解锁时间戳（localStorage） */

const KEY = 'presto_badge_stats';

export type BadgeStats = {
  crossref_open: number;
  strongs_open: number;
  dict_entities: string[];
  map_tours: string[];
  timeline_tours: string[];
  topic_ids: string[];
  parallel_chapters: number;
  xiaoai_questions: number;
  citation_clicks: number;
  save_answer_notes: number;
  share_answers: number;
  half_sheet_xiaoai: number;
  ref_scenes: Record<string, string[]>;
  scenes_used: string[];
  max_followups_session: number;
  night_xiaoai: boolean;
  group_checkins: number;
  group_checkin_dates: Record<string, string[]>;
  group_responses: number;
  groups_created: number;
  plan_shared_group: boolean;
  invites_accepted: number;
  memory_reviews: number;
  wrong_revived: number;
  unlocked_at: Record<string, number>;
  toasted_ids: string[];
};

const EMPTY: BadgeStats = {
  crossref_open: 0,
  strongs_open: 0,
  dict_entities: [],
  map_tours: [],
  timeline_tours: [],
  topic_ids: [],
  parallel_chapters: 0,
  xiaoai_questions: 0,
  citation_clicks: 0,
  save_answer_notes: 0,
  share_answers: 0,
  half_sheet_xiaoai: 0,
  ref_scenes: {},
  scenes_used: [],
  max_followups_session: 0,
  night_xiaoai: false,
  group_checkins: 0,
  group_checkin_dates: {},
  group_responses: 0,
  groups_created: 0,
  plan_shared_group: false,
  invites_accepted: 0,
  memory_reviews: 0,
  wrong_revived: 0,
  unlocked_at: {},
  toasted_ids: [],
};

function ymd(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function readStats(): BadgeStats {
  if (typeof window === 'undefined') return { ...EMPTY };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<BadgeStats>;
    return { ...EMPTY, ...raw, unlocked_at: raw.unlocked_at ?? {}, toasted_ids: raw.toasted_ids ?? [] };
  } catch {
    return { ...EMPTY };
  }
}

function writeStats(s: BadgeStats) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function loadBadgeStats(): BadgeStats {
  return readStats();
}

function patch(mutator: (s: BadgeStats) => void) {
  const s = readStats();
  mutator(s);
  writeStats(s);
  return s;
}

function addUnique(arr: string[], v: string): string[] {
  if (arr.includes(v)) return arr;
  return [...arr, v];
}

export function recordCrossrefOpen() {
  patch((s) => { s.crossref_open += 1; });
  queueBadgeRecheck();
}

export function recordStrongsOpen() {
  patch((s) => { s.strongs_open += 1; });
  queueBadgeRecheck();
}

export function recordDictEntity(id: string) {
  if (!id) return;
  patch((s) => { s.dict_entities = addUnique(s.dict_entities, id); });
  queueBadgeRecheck();
}

export function recordMapTour(id: string) {
  if (!id) return;
  patch((s) => { s.map_tours = addUnique(s.map_tours, id); });
  queueBadgeRecheck();
}

export function recordTimelineTour(id: string) {
  if (!id) return;
  patch((s) => { s.timeline_tours = addUnique(s.timeline_tours, id); });
  queueBadgeRecheck();
}

export function recordTopicVisit(id: string) {
  if (!id) return;
  patch((s) => { s.topic_ids = addUnique(s.topic_ids, id); });
  queueBadgeRecheck();
}

export function recordParallelChapter() {
  patch((s) => { s.parallel_chapters += 1; });
  queueBadgeRecheck();
}

export function recordXiaoAiQuestion(opts?: { scene?: string; ref?: string }) {
  patch((s) => {
    s.xiaoai_questions += 1;
    const hour = new Date().getHours();
    if (hour >= 23 || hour < 5) s.night_xiaoai = true;
    const ref = opts?.ref?.trim();
    const scene = opts?.scene?.trim();
    if (ref && scene) {
      const list = s.ref_scenes[ref] ?? [];
      s.ref_scenes[ref] = addUnique(list, scene);
    }
    if (scene) s.scenes_used = addUnique(s.scenes_used, scene);
  });
  queueBadgeRecheck();
}

export function recordXiaoAiFollowup(countInSession: number) {
  patch((s) => {
    s.max_followups_session = Math.max(s.max_followups_session, countInSession);
  });
  queueBadgeRecheck();
}

export function recordCitationClick() {
  patch((s) => { s.citation_clicks += 1; });
  queueBadgeRecheck();
}

export function recordSaveAnswerNote() {
  patch((s) => { s.save_answer_notes += 1; });
  queueBadgeRecheck();
}

export function recordShareAnswer() {
  patch((s) => { s.share_answers += 1; });
  queueBadgeRecheck();
}

export function recordHalfSheetXiaoAi() {
  patch((s) => { s.half_sheet_xiaoai += 1; });
  queueBadgeRecheck();
}

export function recordGroupCheckin(groupId?: string) {
  patch((s) => {
    s.group_checkins += 1;
    if (groupId) {
      const today = ymd();
      const dates = s.group_checkin_dates[groupId] ?? [];
      if (!dates.includes(today)) {
        s.group_checkin_dates[groupId] = [...dates, today].sort();
      }
    }
  });
  queueBadgeRecheck();
}

export function recordGroupResponse() {
  patch((s) => { s.group_responses += 1; });
  queueBadgeRecheck();
}

export function recordGroupCreated() {
  patch((s) => { s.groups_created += 1; });
  queueBadgeRecheck();
}

export function recordPlanSharedGroup() {
  patch((s) => { s.plan_shared_group = true; });
  queueBadgeRecheck();
}

export function recordInviteAccepted() {
  patch((s) => { s.invites_accepted += 1; });
  queueBadgeRecheck();
}

export function recordMemoryReview() {
  patch((s) => { s.memory_reviews += 1; });
  queueBadgeRecheck();
}

export function recordWrongRevived() {
  patch((s) => { s.wrong_revived += 1; });
  queueBadgeRecheck();
}

/** 某群最长连续打卡天数 */
export function maxGroupCheckinStreak(stats: BadgeStats): number {
  let best = 0;
  for (const dates of Object.values(stats.group_checkin_dates)) {
    if (dates.length === 0) continue;
    const sorted = [...dates].sort();
    let streak = 1;
    let localBest = 1;
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(`${sorted[i - 1]}T12:00:00`);
      const cur = new Date(`${sorted[i]}T12:00:00`);
      const diff = (cur.getTime() - prev.getTime()) / 86400000;
      if (diff === 1) {
        streak += 1;
        localBest = Math.max(localBest, streak);
      } else if (diff > 1) {
        streak = 1;
      }
    }
    best = Math.max(best, localBest);
  }
  return best;
}

export function markBadgeToasted(id: string) {
  patch((s) => {
    if (!s.toasted_ids.includes(id)) s.toasted_ids = [...s.toasted_ids, id];
  });
}

export function stampBadgeUnlock(id: string, at = Date.now()) {
  patch((s) => {
    if (!s.unlocked_at[id]) s.unlocked_at[id] = at;
  });
}

let recheckTimer: ReturnType<typeof setTimeout> | null = null;

/** 防抖重算成就并 toast 新解锁 */
export function queueBadgeRecheck() {
  if (typeof window === 'undefined') return;
  if (recheckTimer) clearTimeout(recheckTimer);
  recheckTimer = setTimeout(() => {
    recheckTimer = null;
    void import('./badge_unlock').then((m) => m.runBadgeRecheck());
  }, 500);
}
