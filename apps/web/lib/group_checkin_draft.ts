const KEY = 'group_checkin_draft';

type Draft = { ref?: string; body?: string; ts: number };

export function saveGroupCheckinDraft(gid: string, ref?: string | null, body?: string | null) {
  if (typeof window === 'undefined' || !gid) return;
  const draft: Draft = { ref: ref || undefined, body: body || undefined, ts: Date.now() };
  sessionStorage.setItem(`${KEY}:${gid}`, JSON.stringify(draft));
}

export function readGroupCheckinDraft(gid: string): Draft | null {
  if (typeof window === 'undefined' || !gid) return null;
  try {
    const raw = JSON.parse(sessionStorage.getItem(`${KEY}:${gid}`) || 'null') as Draft | null;
    if (!raw || Date.now() - raw.ts > 86400000) return null;
    return raw;
  } catch {
    return null;
  }
}

export function clearGroupCheckinDraft(gid: string) {
  sessionStorage.removeItem(`${KEY}:${gid}`);
}
