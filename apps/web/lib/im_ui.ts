/** 与服务端 im_router._RECALL_WINDOW 一致 */
export const RECALL_WINDOW_MS = 2 * 60 * 1000;

export function canRecallOwnMessage(
  createdAt: string | null | undefined,
  opts?: { recalled?: boolean; mine?: boolean; isStaff?: boolean },
): boolean {
  if (opts?.recalled) return false;
  if (!opts?.mine && !opts?.isStaff) return false;
  if (opts?.isStaff && !opts?.mine) return true;
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= RECALL_WINDOW_MS;
}

export function replySnippet(
  body?: string | null,
  kind?: string,
  fileName?: string | null,
): string {
  if (kind === 'image') return '[图片]';
  if (kind === 'file') return fileName ? `[文件] ${fileName}` : '[文件]';
  if (kind === 'checkin') return body?.trim() ? replySnippet(body) : '[打卡]';
  if (kind === 'task') return body?.trim() ? replySnippet(body) : '[任务]';
  const t = (body || '').trim();
  if (!t) return kind === 'verse' ? '[经文]' : '[消息]';
  return t.length > 48 ? `${t.slice(0, 48)}…` : t;
}

export function formatMsgTime(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

export function formatMsgDayLabel(dayKey: string): string {
  const today = localDayKeyNow();
  const yesterday = localDayKeyOffset(-1);
  if (dayKey === today) return '今天';
  if (dayKey === yesterday) return '昨天';
  return dayKey.replace(/-/g, '/');
}

function localDayKeyNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function localDayKeyOffset(days: number): string {
  const d = new Date(Date.now() + days * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function localDayKeyFromIso(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

/** 滚动并短暂高亮某条消息（回复跳转 / 搜索落地） */
export function focusMessageById(mid: string) {
  if (!mid || typeof document === 'undefined') return;
  const el = document.querySelector(`[data-mid="${CSS.escape(mid)}"]`);
  if (!(el instanceof HTMLElement)) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('im-msg-focus');
  window.setTimeout(() => el.classList.remove('im-msg-focus'), 2400);
}

export async function copyMessageText(parts: Array<string | null | undefined>): Promise<boolean> {
  const text = parts.map((p) => (p || '').trim()).filter(Boolean).join('\n');
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
