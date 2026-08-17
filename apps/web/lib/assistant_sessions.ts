import { userLsGet, userLsSet } from './user_storage';
/** 小爱本地会话：续接、分组、校验 */

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
    return sortSessionsDesc(
      parsed
        .filter((s) => s && typeof s.id === 'string' && hasUserMessages(s.msgs ?? []))
        .map((s) => ({
          ...s,
          updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : inferUpdatedAt(s.updated),
        })),
    );
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
  const valid = list.filter((s) => hasUserMessages(s.msgs));
  userLsSet(SESSIONS_KEY, JSON.stringify(sortSessionsDesc(valid).slice(0, 50)));
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

export function formatSessionUpdatedLabel(ts: number): string {
  const now = Date.now();
  const today0 = startOfLocalDay(new Date(now));
  const day0 = startOfLocalDay(new Date(ts));
  const diffDays = Math.round((today0 - day0) / 86400000);
  if (diffDays <= 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return '本周';
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 中国日历日 YYYY-MM-DD（与安卓 SessionRepository 一致） */
function chinaYmdFromMs(ms: number): string {
  const cn = new Date(ms + 8 * 60 * 60 * 1000);
  const y = cn.getUTCFullYear();
  const m = String(cn.getUTCMonth() + 1).padStart(2, '0');
  const d = String(cn.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function chinaTodayYmd(): string {
  return chinaYmdFromMs(Date.now());
}

/**
 * 同锚点 · 当天续用（PRODUCT §5.3；对齐安卓 findResumableSession）。
 * 跨天再进同经节 → 新建。
 */
export function findResumableSession(
  sessions: AssistantSessionRecord[],
  ref: string,
): AssistantSessionRecord | null {
  const key = normalizeSessionRef(ref);
  if (!key) return null;
  const today = chinaTodayYmd();
  return (
    sessions.find(
      (s) =>
        normalizeSessionRef(s.ref) === key
        && chinaYmdFromMs(s.updatedAt ?? 0) === today
        && hasUserMessages(s.msgs),
    ) ?? null
  );
}

export type SessionDateGroup = { label: string; items: AssistantSessionRecord[] };

export function groupSessionsByDate(sessions: AssistantSessionRecord[]): SessionDateGroup[] {
  const order = ['今天', '昨天', '本周'];
  const buckets = new Map<string, AssistantSessionRecord[]>();

  for (const s of sessions) {
    const label = formatSessionUpdatedLabel(s.updatedAt ?? Date.now());
    const list = buckets.get(label) ?? [];
    list.push(s);
    buckets.set(label, list);
  }

  const groups: SessionDateGroup[] = [];
  for (const label of order) {
    const items = buckets.get(label);
    if (items?.length) groups.push({ label, items: sortSessionsDesc(items) });
    buckets.delete(label);
  }
  const rest = [...buckets.entries()].sort((a, b) => {
    const ta = Math.max(...a[1].map(sessionTime));
    const tb = Math.max(...b[1].map(sessionTime));
    return tb - ta;
  });
  for (const [label, items] of rest) {
    if (items.length) groups.push({ label, items: sortSessionsDesc(items) });
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
