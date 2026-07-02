/** 离线经包：下载 zip → 校验 → 解压 → IndexedDB 持久化。 */

import { unzipSync } from 'fflate';
import { idbDelete, idbGet, idbSet } from './offline_idb';

export const OFFLINE_DB_KEY = 'bible_cnv_sqlite_v1';
export const OFFLINE_META_KEY = 'presto_offline_pack_meta';

export interface OfflinePackManifest {
  schema: string;
  version: string;
  translation: string;
  files: { path: string; bytes: number; sha256: string }[];
  file_count: number;
  zip?: string;
  zip_sha256?: string;
}

export interface OfflinePackMeta {
  version: string;
  translation: string;
  installedAt: number;
  bytes: number;
}

const MANIFEST_URL = '/offline/manifest.json';
const ZIP_URL = '/offline/bible_offline.zip';

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function fetchManifest(): Promise<OfflinePackManifest> {
  const res = await fetch(MANIFEST_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('无法获取离线包清单');
  return res.json() as Promise<OfflinePackManifest>;
}

export function loadPackMeta(): OfflinePackMeta | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(OFFLINE_META_KEY);
    return raw ? (JSON.parse(raw) as OfflinePackMeta) : null;
  } catch {
    return null;
  }
}

export function savePackMeta(meta: OfflinePackMeta) {
  localStorage.setItem(OFFLINE_META_KEY, JSON.stringify(meta));
}

export async function isOfflinePackReady(): Promise<boolean> {
  const buf = await idbGet(OFFLINE_DB_KEY);
  return Boolean(buf && buf.byteLength > 0);
}

export async function clearOfflinePack() {
  await idbDelete(OFFLINE_DB_KEY);
  localStorage.removeItem(OFFLINE_META_KEY);
}

export type DownloadProgress = {
  phase: 'manifest' | 'download' | 'verify' | 'extract' | 'save' | 'done';
  percent: number;
  message: string;
};

/** 下载并安装离线经包；返回 sqlite 字节大小。 */
export async function downloadOfflinePack(
  onProgress?: (p: DownloadProgress) => void,
): Promise<number> {
  onProgress?.({ phase: 'manifest', percent: 2, message: '读取清单…' });
  const manifest = await fetchManifest();
  const sqliteEntry = manifest.files.find((f) => f.path.endsWith('.sqlite'));
  if (!sqliteEntry) throw new Error('清单中缺少经库文件');

  onProgress?.({ phase: 'download', percent: 8, message: '下载经包…' });
  const res = await fetch(ZIP_URL);
  if (!res.ok) throw new Error('下载经包失败');
  const zipBuf = await res.arrayBuffer();

  if (manifest.zip_sha256) {
    onProgress?.({ phase: 'verify', percent: 55, message: '校验文件…' });
    const got = await sha256Hex(zipBuf);
    if (got !== manifest.zip_sha256) throw new Error('经包校验失败，请重试');
  }

  onProgress?.({ phase: 'extract', percent: 65, message: '解压经库…' });
  const files = unzipSync(new Uint8Array(zipBuf));
  const sqlitePath = Object.keys(files).find((p) => p.endsWith('.sqlite'));
  if (!sqlitePath) throw new Error('压缩包内缺少经库');
  const sqliteBytes = files[sqlitePath];
  const sqliteBuf = sqliteBytes.buffer.slice(
    sqliteBytes.byteOffset,
    sqliteBytes.byteOffset + sqliteBytes.byteLength,
  );

  const fileHash = await sha256Hex(sqliteBuf);
  if (fileHash !== sqliteEntry.sha256) throw new Error('经库校验失败');

  onProgress?.({ phase: 'save', percent: 85, message: '写入本地…' });
  await idbSet(OFFLINE_DB_KEY, sqliteBuf);
  savePackMeta({
    version: manifest.version,
    translation: manifest.translation,
    installedAt: Date.now(),
    bytes: sqliteBuf.byteLength,
  });
  onProgress?.({ phase: 'done', percent: 100, message: '安装完成' });
  return sqliteBuf.byteLength;
}

export async function loadOfflineSqliteBytes(): Promise<ArrayBuffer | null> {
  return idbGet(OFFLINE_DB_KEY);
}
