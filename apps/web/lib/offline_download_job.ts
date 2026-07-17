/** 离线项后台下载队列：关闭下载页不中断，UI 通过订阅同步进度。 */

import { getCatalogItem } from './offline_catalog';
import {
  downloadOfflineItem,
  releaseOfflineZipCache,
  type DownloadProgress,
} from './offline_pack';

export const OFFLINE_DOWNLOAD_EVENT = 'presto-offline-download';

export type OfflineDownloadSnapshot = {
  /** 当前正在处理的项 */
  busyId: string | null;
  /** 排队中的项（不含 busyId） */
  queuedIds: string[];
  progress: DownloadProgress | null;
  error: string | null;
  lastCompletedId: string | null;
};

type Listener = () => void;
type Settle = { resolve: () => void; reject: (err: unknown) => void };

const queue: string[] = [];
const waiters = new Map<string, Settle[]>();
const listeners = new Set<Listener>();

let busyId: string | null = null;
let progress: DownloadProgress | null = null;
let error: string | null = null;
let lastCompletedId: string | null = null;
let pumping = false;

function emit() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OFFLINE_DOWNLOAD_EVENT));
  }
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

export function getOfflineDownloadSnapshot(): OfflineDownloadSnapshot {
  return {
    busyId,
    queuedIds: [...queue],
    progress,
    error,
    lastCompletedId,
  };
}

export function isOfflineDownloadActive(): boolean {
  return busyId != null || queue.length > 0;
}

export function subscribeOfflineDownload(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 入队下载；同一项已在队列或进行中则复用。关闭页面不影响。 */
export function enqueueOfflineItemDownload(itemId: string): Promise<void> {
  if (busyId === itemId || queue.includes(itemId)) {
    return new Promise<void>((resolve, reject) => {
      const list = waiters.get(itemId) ?? [];
      list.push({ resolve, reject });
      waiters.set(itemId, list);
    });
  }

  return new Promise<void>((resolve, reject) => {
    const list = waiters.get(itemId) ?? [];
    list.push({ resolve, reject });
    waiters.set(itemId, list);
    queue.push(itemId);
    error = null;
    emit();
    void pumpQueue();
  });
}

function settle(itemId: string, err?: unknown) {
  const list = waiters.get(itemId) ?? [];
  waiters.delete(itemId);
  for (const w of list) {
    if (err !== undefined) w.reject(err);
    else w.resolve();
  }
}

async function pumpQueue() {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length) {
      const itemId = queue.shift()!;
      busyId = itemId;
      progress = { phase: 'manifest', percent: 0, message: '准备下载…' };
      error = null;
      emit();
      try {
        await downloadOfflineItem(itemId, (p) => {
          if (busyId !== itemId) return;
          progress = p;
          emit();
        });
        lastCompletedId = itemId;
        settle(itemId);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        settle(itemId, e);
      } finally {
        if (busyId === itemId) {
          busyId = null;
          progress = null;
        }
        emit();
      }
    }
  } finally {
    pumping = false;
    if (!isOfflineDownloadActive()) {
      releaseOfflineZipCache();
    }
    if (queue.length) void pumpQueue();
  }
}

export function offlineDownloadLabel(snap: OfflineDownloadSnapshot): string | null {
  if (!snap.busyId && !snap.queuedIds.length) return null;
  const item = snap.busyId ? getCatalogItem(snap.busyId) : null;
  const name = item?.name ?? '离线包';
  if (snap.progress?.message) {
    const pct = snap.progress.percent > 0 ? ` ${snap.progress.percent}%` : '';
    return `${snap.progress.message}${pct}`;
  }
  return `正在下载${name}…`;
}
