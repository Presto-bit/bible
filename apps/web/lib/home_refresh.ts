/** 首页回前台刷新节流：合并 focus/visibility，网络请求带 TTL */

export const HOME_RAIL_NET_TTL_MS = 90_000;
export const HOME_BOOTSTRAP_TTL_MS = 5 * 60_000;
export const HOME_REFRESH_DEBOUNCE_MS = 280;
/** 手动下拉刷新最短间隔 */
export const HOME_PTR_MIN_INTERVAL_MS = 1500;

export type HomeRefreshReason = 'awake' | 'focus' | 'visibility' | 'day' | 'manual';

export function shouldFetchHomeNetwork(
  lastAt: number,
  ttlMs: number,
  force?: boolean,
): boolean {
  if (force) return true;
  if (!lastAt) return true;
  return Date.now() - lastAt >= ttlMs;
}
