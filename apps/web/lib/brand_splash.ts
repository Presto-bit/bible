/** PWA 冷启动品牌开屏：纸底 + App icon + 彼爱 / Love Each Other */

import { isStandalonePwa } from './platform';
import { isFlutterH5Host } from './flutter_h5_bridge';

export const BRAND_SPLASH_SESSION_KEY = 'peiai_brand_splash_done_v1';
/** 接管控后至少稳定展示 2s（不含 250ms 淡出） */
export const BRAND_SPLASH_MIN_MS = 2000;
export const BRAND_SPLASH_FADE_MS = 250;
/** 接管控后兜底最长（MIN + 800ms） */
export const BRAND_SPLASH_MAX_MS = 2800;
export const BRAND_SPLASH_BG = '#FFFCFA';
export const BRAND_SPLASH_TITLE = '彼爱';
export const BRAND_SPLASH_SUBTITLE = 'Love Each Other';

export const BRAND_SPLASH_DONE_EVENT = 'peiai-brand-splash-done';

export function markBrandSplashDone(): void {
  if (typeof window !== 'undefined') {
    window.__PEIAI_SPLASH_DONE__ = true;
    window.dispatchEvent(new Event(BRAND_SPLASH_DONE_EVENT));
  }
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(BRAND_SPLASH_SESSION_KEY, '1');
  } catch {
    /* ignore */
  }
}

/** 开屏已结束或从未展示时立刻回调 */
export function subscribeBrandSplashDone(onDone: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  if (hasBrandSplashDone()) {
    onDone();
    return () => {};
  }
  const handler = () => onDone();
  window.addEventListener(BRAND_SPLASH_DONE_EVENT, handler);
  return () => window.removeEventListener(BRAND_SPLASH_DONE_EVENT, handler);
}

/** 同会话热启动：不再出开屏（进程内内存 + sessionStorage） */
export function hasBrandSplashDone(): boolean {
  if (typeof window !== 'undefined' && window.__PEIAI_SPLASH_DONE__ === true) {
    return true;
  }
  if (typeof sessionStorage === 'undefined') return false;
  try {
    return sessionStorage.getItem(BRAND_SPLASH_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * 仅 PWA standalone 冷启动（桌面点图标 / 杀进程重开 / 深链冷启动）。
 * 安卓 Flutter WebView 壳、浏览器标签页不出。
 */
export function shouldShowBrandSplash(): boolean {
  if (typeof window === 'undefined') return false;
  /* head 已挂 pending 时须走完计时，勿因 session 标记提前拆掉 */
  if (document.documentElement.classList.contains('peiai-splash-pending')) return true;
  if (!isStandalonePwa()) return false;
  if (isFlutterH5Host()) return false;
  if (hasBrandSplashDone()) return false;
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type === 'back_forward') return false;
  } catch {
    /* ignore */
  }
  return true;
}

/** 深链冷启动：开屏结束后保留当前 URL，无需再跳 */
export function captureBrandSplashEntryHref(): string {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}${window.location.hash}` || '/';
}

declare global {
  interface Window {
    __PEIAI_SPLASH_DONE__?: boolean;
    /** head 脚本写入；hydration 晚到时不缩短可见开屏 */
    __PEIAI_SPLASH_START__?: number;
  }
}
