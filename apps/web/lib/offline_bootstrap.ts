/** 首次启动后台静默下载离线经包 */

import { isOfflineDownloadActive } from './offline_download_job';
import { downloadOfflinePack, isAutoBiblePackReady, isOfflinePackReady } from './offline_pack';
const AUTO_KEY = 'presto_offline_auto_done';
const FAIL_KEY = 'presto_offline_auto_fail';
const RETRY_MS = 24 * 60 * 60 * 1000;

let running: Promise<void> | null = null;

export type OfflinePackStatus = 'ready' | 'missing' | 'failed' | 'loading';

export async function offlinePackStatus(): Promise<OfflinePackStatus> {
  if (await isOfflinePackReady()) return 'ready';
  if (isOfflineDownloadActive() || running) return 'loading';
  if (localStorage.getItem(FAIL_KEY)) return 'failed';
  return 'missing';
}

/** 后台下载；已安装或省流/弱网时跳过 */
export function ensureOfflinePackAutoDownload(): Promise<void> {
  if (running) return running;
  running = (async () => {
    if (await isAutoBiblePackReady()) {
      localStorage.setItem(AUTO_KEY, '1');
      return;
    }
    const failAt = Number(localStorage.getItem(FAIL_KEY) || '0');
    if (failAt && Date.now() - failAt < RETRY_MS) return;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (conn?.saveData) return;
    if (conn?.effectiveType && /(^2g$|^slow-2g$)/.test(conn.effectiveType)) return;
    try {
      await downloadOfflinePack();
      localStorage.setItem(AUTO_KEY, '1');
      localStorage.removeItem(FAIL_KEY);
    } catch {
      localStorage.setItem(FAIL_KEY, String(Date.now()));
    }
  })();
  return running;
}

export function offlineAutoDownloadDone(): boolean {
  return typeof window !== 'undefined' && localStorage.getItem(AUTO_KEY) === '1';
}
