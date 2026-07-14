/** 离线包解压 Worker：避免 unzipSync 堵死主线程。 */

import { unzipSync } from 'fflate';

export type UnzipWorkerRequest = {
  id: number;
  zip: ArrayBuffer;
  paths?: string[];
};

export type UnzipWorkerResponse =
  | { id: number; ok: true; files: Record<string, ArrayBuffer> }
  | { id: number; ok: false; error: string };

function pathWanted(name: string, paths: string[]): boolean {
  return paths.some((p) => {
    const base = p.split('/').pop() ?? p;
    return name === p || name.endsWith(`/${base}`) || name.endsWith(p);
  });
}

const ctx: Worker = self as unknown as Worker;

ctx.onmessage = (ev: MessageEvent<UnzipWorkerRequest>) => {
  const { id, zip, paths } = ev.data;
  try {
    const filter = paths?.length
      ? (file: { name: string }) => pathWanted(file.name, paths)
      : undefined;
    const raw = unzipSync(new Uint8Array(zip), filter ? { filter } : undefined);
    const files: Record<string, ArrayBuffer> = {};
    const transfer: Transferable[] = [];
    for (const [path, u8] of Object.entries(raw)) {
      const buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
      files[path] = buf;
      transfer.push(buf);
    }
    const res: UnzipWorkerResponse = { id, ok: true, files };
    ctx.postMessage(res, transfer);
  } catch (e) {
    const res: UnzipWorkerResponse = {
      id,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
    ctx.postMessage(res);
  }
};
