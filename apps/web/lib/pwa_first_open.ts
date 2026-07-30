/** PWA standalone 首启：内容优先 → 读后再问提醒 → 软设密 */

export const PWA_FIRST_OPEN_KEY = 'presto_pwa_first_open_done';
/** 已落地内容、等待有效读经后再出提醒 */
export const PWA_FIRST_OPEN_WAITING_KEY = 'presto_pwa_first_open_waiting';
/** 客户端：有效读经后触发提醒引导 */
export const PWA_VALUE_EVENT = 'presto-pwa-value';

const VALUE_EVENTS = new Set([
  'daily_verse_view',
  'reader_open',
  'plan_day_done',
  'warmup_finish',
  'ai_ask',
]);

/** 无读经信号时的兜底等待（毫秒） */
export const PWA_FIRST_OPEN_FALLBACK_MS = 12_000;

export function isPwaFirstOpenDone(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(PWA_FIRST_OPEN_KEY) === '1';
  } catch {
    return true;
  }
}

export function markPwaFirstOpenDone(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PWA_FIRST_OPEN_KEY, '1');
    localStorage.removeItem(PWA_FIRST_OPEN_WAITING_KEY);
  } catch {
    /* ignore */
  }
}

export function isPwaFirstOpenWaiting(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(PWA_FIRST_OPEN_WAITING_KEY) === '1';
  } catch {
    return false;
  }
}

export function markPwaFirstOpenWaiting(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PWA_FIRST_OPEN_WAITING_KEY, '1');
  } catch {
    /* ignore */
  }
}

/** 产品事件打点时：若属有效读经，广播给首启引导 */
export function maybeEmitPwaValue(eventName: string): void {
  if (typeof window === 'undefined') return;
  if (!VALUE_EVENTS.has(eventName)) return;
  window.dispatchEvent(new CustomEvent(PWA_VALUE_EVENT, { detail: { event: eventName } }));
}
