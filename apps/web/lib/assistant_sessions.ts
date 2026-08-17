import { bodyText } from './assistant_format';
import { userLsGet, userLsSet } from './user_storage';
/** 小爱本地会话：续接、分组、校验 */

/** 历史列表保留窗口（与抽屉文案一致）。 */
export const HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const HISTORY_MAX = 50;

export interface AssistantSessionMsg {
  role: 'user' | 'assistant';
  text: string;
}

export interface AssistantSessionRecord {
  id: string;
  title: string;
  ref: string;
  preview: string;
  updated: string;
  updatedAt?: number;
  msgs: AssistantSessionMsg[];
}

const SESSIONS_KEY = 'assistant_sessions_v1';

export function normalizeSessionRef(ref: string): string {
  return ref.trim().toUpperCase().split('@')[0] ?? '';
}

export function hasUserMessages(msgs: AssistantSessionMsg[]): boolean {
  return msgs.some((m) => m.role === 'user' && m.text.trim().length > 0);
}

export function loadAssistantSessions(): AssistantSessionRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = userLsGet(SESSIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const list = sortSessionsDesc(
      parsed
        .filter((s) => s && typeof s.id === 'string' && hasUserMessages(s.msgs ?? []))
        .map((s) => ({
          ...s,
          updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : inferUpdatedAt(s.updated),
        }))
        .filter((s) => isWithinHistoryRetention(s.updatedAt ?? 0)),
    ).slice(0, HISTORY_MAX);
    if (list.length !== parsed.length) {
      try {
        userLsSet(SESSIONS_KEY, JSON.stringify(list));
      } catch {
        /* ignore */
      }
    }
    return list;
  } catch {
    return [];
  }
}

function sessionTime(s: AssistantSessionRecord): number {
  return s.updatedAt ?? 0;
}

function sortSessionsDesc(list: AssistantSessionRecord[]): AssistantSessionRecord[] {
  return [...list].sort((a, b) => sessionTime(b) - sessionTime(a));
}

function inferUpdatedAt(label: string | undefined): number {
  if (label === '今天') return Date.now();
  if (label === '昨天') return Date.now() - 86400000;
  return Date.now() - 3 * 86400000;
}

export function saveAssistantSessions(list: AssistantSessionRecord[]) {
  if (typeof window === 'undefined') return;
  const valid = list.filter(
    (s) => hasUserMessages(s.msgs) && isWithinHistoryRetention(s.updatedAt ?? 0),
  );
  userLsSet(SESSIONS_KEY, JSON.stringify(sortSessionsDesc(valid).slice(0, HISTORY_MAX)));
}

export function renameAssistantSession(id: string, title: string): AssistantSessionRecord[] {
  const trimmed = title.trim();
  if (!trimmed) return loadAssistantSessions();
  const next = loadAssistantSessions().map((s) =>
    s.id === id ? { ...s, title: trimmed } : s,
  );
  saveAssistantSessions(next);
  return next;
}

export function deleteAssistantSession(id: string): AssistantSessionRecord[] {
  const next = loadAssistantSessions().filter((s) => s.id !== id);
  saveAssistantSessions(next);
  return next;
}

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function diffLocalDays(ts: number): number {
  const today0 = startOfLocalDay(new Date());
  const day0 = startOfLocalDay(new Date(ts));
  return Math.round((today0 - day0) / 86400000);
}

export function isWithinHistoryRetention(ts: number): boolean {
  if (!ts) return false;
  return Date.now() - ts <= HISTORY_RETENTION_MS;
}

function clipText(raw: string, max: number): string {
  const t = raw.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** 是否仍是系统默认标题（未手动改名）。 */
export function isDefaultSessionTitle(
  title: string,
  ref: string,
  firstUserText?: string,
): boolean {
  const t = title.trim();
  if (!t || t === '新会话' || t === '随问') return true;
  if (/^关于\s/u.test(t)) return true;
  const key = normalizeSessionRef(ref);
  if (key && t.toUpperCase() === key) return true;
  if (ref && t === ref) return true;
  const first = clipText(firstUserText ?? '', 18);
  if (first && (t === first || t === (firstUserText ?? '').trim().slice(0, 18))) return true;
  return false;
}

export function sessionDisplayTitle(s: AssistantSessionRecord): string {
  const firstUser =
    s.msgs.find((m) => m.role === 'user' && m.text.trim())?.text ?? '';
  if (!isDefaultSessionTitle(s.title, s.ref, firstUser)) {
    return clipText(s.title, 18);
  }
  const fromQ = clipText(firstUser, 18);
  if (fromQ) return fromQ;
  return '随问';
}

export function sessionPreviewText(s: AssistantSessionRecord): string {
  for (let i = s.msgs.length - 1; i >= 0; i -= 1) {
    const m = s.msgs[i];
    if (m.role !== 'assistant' || !m.text.trim()) continue;
    const t = clipText(bodyText(m.text), 40);
    if (t) return t;
  }
  return clipText(s.preview || '', 40);
}

/** 分组头：今天 / 昨天 / 本周 / 更早 */
export function formatSessionGroupLabel(ts: number): string {
  const diffDays = diffLocalDays(ts);
  if (diffDays <= 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return '本周';
  return '更早';
}

export function isHistoryGroupExpandedByDefault(label: string): boolean {
  return label === '今天' || label === '昨天';
}

/** 行内时间：今天显示时刻，便于同组区分 */
export function formatSessionRowTime(ts: number): string {
  const diffDays = diffLocalDays(ts);
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  if (diffDays <= 0) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) {
    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()] ?? '本周';
  }
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 存盘用日期标签；列表分组请用 formatSessionGroupLabel */
export function formatSessionUpdatedLabel(ts: number): string {
  return formatSessionGroupLabel(ts);
}

const RESUME_WINDOW_MS = 72 * 60 * 60 * 1000;

/**
 * 同锚点 · 72 小时内续用（双端一致）。
 * 超出窗口再进同经节 → 新建。
 */
export function findResumableSession(
  sessions: AssistantSessionRecord[],
  ref: string,
  withinMs = RESUME_WINDOW_MS,
): AssistantSessionRecord | null {
  const key = normalizeSessionRef(ref);
  if (!key) return null;
  const cutoff = Date.now() - withinMs;
  return (
    sessions.find(
      (s) =>
        normalizeSessionRef(s.ref) === key
        && (s.updatedAt ?? 0) >= cutoff
        && hasUserMessages(s.msgs),
    ) ?? null
  );
}

export type SessionDateGroup = { label: string; items: AssistantSessionRecord[] };

export function groupSessionsByDate(sessions: AssistantSessionRecord[]): SessionDateGroup[] {
  const order = ['今天', '昨天', '本周', '更早'];
  const buckets = new Map<string, AssistantSessionRecord[]>();

  for (const s of sessions) {
    const label = formatSessionGroupLabel(s.updatedAt ?? Date.now());
    const list = buckets.get(label) ?? [];
    list.push(s);
    buckets.set(label, list);
  }

  const groups: SessionDateGroup[] = [];
  for (const label of order) {
    const items = buckets.get(label);
    if (items?.length) groups.push({ label, items: sortSessionsDesc(items) });
  }
  return groups;
}

/** 按经节锚点分组（无锚点归「随问」） */
export function groupSessionsByRef(sessions: AssistantSessionRecord[]): SessionDateGroup[] {
  const buckets = new Map<string, AssistantSessionRecord[]>();
  for (const s of sessions) {
    const key = normalizeSessionRef(s.ref);
    const label = key || '随问';
    const list = buckets.get(label) ?? [];
    list.push(s);
    buckets.set(label, list);
  }
  const entries = [...buckets.entries()].sort((a, b) => {
    if (a[0] === '随问') return 1;
    if (b[0] === '随问') return -1;
    const ta = Math.max(...a[1].map(sessionTime));
    const tb = Math.max(...b[1].map(sessionTime));
    return tb - ta;
  });
  return entries.map(([key, items]) => ({
    label: key === '随问' ? '随问' : key,
    items: sortSessionsDesc(items),
  }));
}
