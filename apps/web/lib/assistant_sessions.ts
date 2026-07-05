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
const RESUME_WINDOW_MS = 24 * 60 * 60 * 1000;

export function normalizeSessionRef(ref: string): string {
  return ref.trim().toUpperCase().split('@')[0] ?? '';
}

export function hasUserMessages(msgs: AssistantSessionMsg[]): boolean {
  return msgs.some((m) => m.role === 'user' && m.text.trim().length > 0);
}

export function loadAssistantSessions(): AssistantSessionRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
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
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sortSessionsDesc(valid).slice(0, 50)));
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

/** 24 小时内同锚点最近会话 */
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
