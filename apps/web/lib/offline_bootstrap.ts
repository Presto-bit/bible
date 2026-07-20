/** 首次启动后台静默下载离线经包（须让路首屏） */

import { isOfflineDownloadActive } from './offline_download_job';
import { downloadOfflinePack, isAutoBiblePackReady, isOfflinePackReady } from './offline_pack';

const AUTO_KEY = 'presto_offline_auto_done';
const FAIL_KEY = 'presto_offline_auto_fail';
const RETRY_MS = 24 * 60 * 60 * 1000;

/** 首屏就绪后再下经包；超时兜底避免永远不下 */
export const HOME_READY_EVENT = 'presto-home-bootstrap-ready';
const DEFER_MIN_MS = 12_000;
const DEFER_MAX_MS = 45_000;

let running: Promise<void> | null = null;
let scheduled = false;

export type OfflinePackStatus = 'ready' | 'missing' | 'failed' | 'loading';

export async function offlinePackStatus(): Promise<OfflinePackStatus> {
  if (await isOfflinePackReady()) return 'ready';
  // 仅在「队列有任务」或「自动下载仍在进行」时视为 loading；已结束的 Promise 不得占坑
  if (isOfflineDownloadActive() || running) return 'loading';
  if (localStorage.getItem(FAIL_KEY)) return 'failed';
  return 'missing';
}

function shouldSkipAutoDownload(): boolean {
  const conn = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (conn?.saveData) return true;
  if (conn?.effectiveType && /(^2g$|^slow-2g$)/.test(conn.effectiveType)) return true;
  return false;
}

/** 立即后台下载；已安装或省流/弱网时跳过 */
export function ensureOfflinePackAutoDownload(): Promise<void> {
  if (running) return running;
  const job = (async () => {
    if (await isAutoBiblePackReady()) {
      localStorage.setItem(AUTO_KEY, '1');
      return;
    }
    const failAt = Number(localStorage.getItem(FAIL_KEY) || '0');
    if (failAt && Date.now() - failAt < RETRY_MS) return;
    if (shouldSkipAutoDownload()) return;
    try {
      await downloadOfflinePack();
      localStorage.setItem(AUTO_KEY, '1');
      localStorage.removeItem(FAIL_KEY);
    } catch {
      localStorage.setItem(FAIL_KEY, String(Date.now()));
    }
  })();
  running = job.finally(() => {
    if (running === job) running = null;
  });
  return running;
}

/**
 * 启动期调度：等首页 bootstrap 就绪 + 最短延迟，或超时兜底。
 * 避免 26MB zip 与 auth/首屏 API 抢带宽。
 */
export function scheduleOfflinePackAutoDownload(): void {
  if (typeof window === 'undefined' || scheduled) return;
  scheduled = true;

  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    window.removeEventListener(HOME_READY_EVENT, onHomeReady);
    const run = () => {
      void ensureOfflinePackAutoDownload();
    };
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => run(), { timeout: 4000 });
    } else {
      window.setTimeout(run, 800);
    }
  };

  const onHomeReady = () => {
    window.setTimeout(start, DEFER_MIN_MS);
  };

  window.addEventListener(HOME_READY_EVENT, onHomeReady, { once: true });
  // 兜底：用户未开首页 / 事件丢失时仍会下载
  window.setTimeout(start, DEFER_MAX_MS);
}

export function markHomeBootstrapReady(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(HOME_READY_EVENT));
}

export function offlineAutoDownloadDone(): boolean {
  return typeof window !== 'undefined' && localStorage.getItem(AUTO_KEY) === '1';
}
