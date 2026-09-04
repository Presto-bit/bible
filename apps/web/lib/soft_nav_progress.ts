/** Soft nav（Next router.push）进度：弱网时给即时反馈，避免「点了没反应」。 */

import { normalizeAppPath } from './tab_keep_alive';

const EVENT = 'presto-soft-nav';
const FAIL_EVENT = 'presto-soft-nav-fail';

export type SoftNavProgressDetail = {
  active: boolean;
  href?: string;
};

export type SoftNavFailDetail = {
  href: string;
  reason: 'timeout';
};

let activeHref: string | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

/** 二级 soft-nav 超时：清进度 + 通知壳层清 pending + toast */
const SOFT_NAV_TIMEOUT_MS = 15_000;

function emit(active: boolean, href?: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<SoftNavProgressDetail>(EVENT, {
      detail: { active, href },
    }),
  );
}

function emitFail(href: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<SoftNavFailDetail>(FAIL_EVENT, {
      detail: { href, reason: 'timeout' },
    }),
  );
}

export function getSoftNavActiveHref(): string | null {
  return activeHref;
}

function pathMatchesTarget(pathname: string, href: string): boolean {
  const target = normalizeAppPath((href.split('?')[0] ?? href) || '/');
  const cur = normalizeAppPath((pathname.split('?')[0] ?? pathname) || '/');
  return cur === target || cur.startsWith(`${target}/`);
}

/** 二级页 soft nav 开始：立刻亮顶栏进度 */
export function beginSoftNavProgress(href: string): void {
  activeHref = href;
  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
  emit(true, href);
  clearTimer = setTimeout(() => {
    if (activeHref !== href) return;
    const failed = href;
    endSoftNavProgress();
    emitFail(failed);
  }, SOFT_NAV_TIMEOUT_MS);
}

/** 路径已切换或导航取消时收起 */
export function endSoftNavProgress(): void {
  activeHref = null;
  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
  emit(false);
}

/**
 * pathname 变化时：仅当已到达本次 soft-nav 目标（或目标前缀）才结束。
 * 用 normalizeAppPath，避免 basePath 导致进度条永不消失。
 */
export function endSoftNavProgressIfArrived(pathname: string): void {
  if (!activeHref) return;
  if (pathMatchesTarget(pathname, activeHref)) {
    endSoftNavProgress();
  }
}

export function subscribeSoftNavProgress(
  onChange: (detail: SoftNavProgressDetail) => void,
): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<SoftNavProgressDetail>).detail;
    onChange(detail ?? { active: false });
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

export function subscribeSoftNavFail(
  onFail: (detail: SoftNavFailDetail) => void,
): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<SoftNavFailDetail>).detail;
    if (detail) onFail(detail);
  };
  window.addEventListener(FAIL_EVENT, handler);
  return () => window.removeEventListener(FAIL_EVENT, handler);
}
