/** 主线程侧：Worker 解压 zip；失败时回退到 fflate 同步解压。 */

import { unzipSync } from 'fflate';
import type { UnzipWorkerRequest, UnzipWorkerResponse } from './offline_unzip.worker';

function pathWanted(name: string, paths: string[]): boolean {
  return paths.some((p) => {
    const base = p.split('/').pop() ?? p;
    return name === p || name.endsWith(`/${base}`) || name.endsWith(p);
  });
}

function toRecord(raw: Record<string, Uint8Array>): Record<string, Uint8Array> {
  return raw;
}

function unzipOnMainThread(zipBuf: ArrayBuffer, paths?: string[]): Record<string, Uint8Array> {
  const filter = paths?.length
    ? (file: { name: string }) => pathWanted(file.name, paths)
    : undefined;
  return toRecord(unzipSync(new Uint8Array(zipBuf), filter ? { filter } : undefined));
}

let worker: Worker | null | undefined;
let nextId = 1;

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    worker = null;
    return worker;
  }
  try {
    worker = new Worker(new URL('./offline_unzip.worker.ts', import.meta.url));
  } catch {
    worker = null;
  }
  return worker;
}

/** 解压离线 zip；paths 指定时只保留匹配条目，降低主线程回传体积。 */
export function unzipOfflineZip(
  zipBuf: ArrayBuffer,
  paths?: string[],
): Promise<Record<string, Uint8Array>> {
  const w = getWorker();
  if (!w) {
    return Promise.resolve(unzipOnMainThread(zipBuf, paths));
  }

  const id = nextId++;
  const zipCopy = zipBuf.slice(0);

  return new Promise((resolve, reject) => {
    const onMessage = (ev: MessageEvent<UnzipWorkerResponse>) => {
      if (ev.data?.id !== id) return;
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      if (!ev.data.ok) {
        reject(new Error(ev.data.error || '解压失败'));
        return;
      }
      const out: Record<string, Uint8Array> = {};
      for (const [path, buf] of Object.entries(ev.data.files)) {
        out[path] = new Uint8Array(buf);
      }
      resolve(out);
    };
    const onError = () => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      try {
        resolve(unzipOnMainThread(zipBuf, paths));
      } catch (e) {
        reject(e);
      }
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    const req: UnzipWorkerRequest = { id, zip: zipCopy, paths };
    w.postMessage(req, [zipCopy]);
  });
}
