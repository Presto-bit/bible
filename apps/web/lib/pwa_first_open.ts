/** PWA standalone 首启黄金链路：欢迎 → 提醒 → 软设密 */

export const PWA_FIRST_OPEN_KEY = 'presto_pwa_first_open_done';

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
  } catch {
    /* ignore */
  }
}
