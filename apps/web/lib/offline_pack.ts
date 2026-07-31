/** 离线经包：下载 zip / 和合本直链 sqlite → 校验 → IndexedDB（CNV / CUVS / 当代 / KJV）。 */

import { idbDelete, idbGet, idbGetBundle, idbSet, idbSetBundle } from './offline_idb';
import {
  bundleIdbKey,
  getCatalogItem,
  OFFLINE_CATALOG,
  type OfflineCatalogItem,
} from './offline_catalog';

import { withBasePath } from './basePath';
import { unzipOfflineZip } from './offline_unzip';

export const OFFLINE_CNV_KEY = 'bible_cnv_sqlite_v1';
export const OFFLINE_CUVS_KEY = 'bible_cuvs_sqlite_v1';
export const OFFLINE_KJV_KEY = 'bible_kjv_sqlite_v1';
export const OFFLINE_CONTEMPORARY_KEY = 'bible_contemporary_sqlite_v1';
/** @deprecated 兼容旧键名 */
export const OFFLINE_DB_KEY = OFFLINE_CNV_KEY;
export const OFFLINE_META_KEY = 'presto_offline_pack_meta';
export const OFFLINE_ITEMS_REGISTRY_KEY = 'presto_offline_items_v1';

export type OfflineTranslation = 'cnv' | 'cuvs' | 'kjv' | 'contemporary';

const BIBLE_OFFLINE_IDS = ['cnv', 'cuvs', 'kjv', 'contemporary'] as const;

export type OfflineItemRecord = {
  manifestVersion: string;
  fileHashes: Record<string, string>;
  installedAt: number;
  bytes: number;
  /** false = 用户已删文件，记录保留 */
  hasFiles: boolean;
};

export type OfflineItemStatus = 'download' | 'update' | 'ready';

export interface OfflinePackManifest {
  schema: string;
  version: string;
  translation: string;
  files: { path: string; bytes: number; sha256: string }[];
  file_count: number;
  zip?: string;
  zip_sha256?: string;
  /** 和合本单独直链（相对 /offline/），避免自动装时拉整包 zip */
  cuvs_sqlite?: string;
  cuvs_sqlite_sha256?: string;
  cuvs_sqlite_bytes?: number;
  /** 当代译本单独直链（相对 /offline/） */
  contemporary_sqlite?: string;
  contemporary_sqlite_sha256?: string;
  contemporary_sqlite_bytes?: number;
}

export interface OfflinePackMeta {
  version: string;
  translation: string;
  installedAt: number;
  bytes: number;
  translations?: OfflineTranslation[];
}

const MANIFEST_URL = withBasePath('/offline/manifest.json');
const ZIP_URL = withBasePath('/offline/bible_offline.zip');

let zipCache: { version: string; buf: ArrayBuffer } | null = null;

/** 释放内存中的离线 zip（全部下载任务结束后由下载队列调用；进行中勿清） */
export function releaseOfflineZipCache(): void {
  zipCache = null;
}

function loadItemsRegistry(): Record<string, OfflineItemRecord> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(OFFLINE_ITEMS_REGISTRY_KEY);
    return raw ? (JSON.parse(raw) as Record<string, OfflineItemRecord>) : {};
  } catch {
    return {};
  }
}

function saveItemsRegistry(registry: Record<string, OfflineItemRecord>) {
  localStorage.setItem(OFFLINE_ITEMS_REGISTRY_KEY, JSON.stringify(registry));
}

export function loadItemRecord(itemId: string): OfflineItemRecord | null {
  return loadItemsRegistry()[itemId] ?? null;
}

function saveItemRecord(itemId: string, record: OfflineItemRecord) {
  const registry = loadItemsRegistry();
  registry[itemId] = record;
  saveItemsRegistry(registry);
}

function manifestFilesForItem(
  item: OfflineCatalogItem,
  manifest: OfflinePackManifest,
) {
  if (item.paths?.length) {
    return manifest.files.filter((f) => item.paths!.includes(f.path));
  }
  if (item.pathsPrefix) {
    return manifest.files.filter((f) => f.path.startsWith(item.pathsPrefix!));
  }
  return [];
}

function findZipEntry(files: Record<string, Uint8Array>, manifestPath: string) {
  const base = manifestPath.split('/').pop() ?? manifestPath;
  const zipPath = Object.keys(files).find(
    (p) => p === manifestPath || p.endsWith(`/${base}`) || p.endsWith(manifestPath),
  );
  return zipPath ? files[zipPath] : null;
}

async function fetchOfflineZip(manifest: OfflinePackManifest): Promise<ArrayBuffer> {
  if (zipCache?.version === manifest.version) return zipCache.buf;
  const res = await fetch(ZIP_URL);
  if (!res.ok) throw new Error('下载资源包失败');
  const zipBuf = await res.arrayBuffer();
  if (manifest.zip_sha256) {
    const got = await sha256Hex(zipBuf);
    if (got !== manifest.zip_sha256) throw new Error('资源包校验失败，请重试');
  }
  zipCache = { version: manifest.version, buf: zipBuf };
  return zipBuf;
}

function syncLegacyBibleRecords() {
  if (typeof window === 'undefined') return;
  void (async () => {
    const manifest = await fetchManifest().catch(() => null);
    if (!manifest) return;
    const registry = loadItemsRegistry();
    let changed = false;
    for (const id of BIBLE_OFFLINE_IDS) {
      const item = getCatalogItem(id);
      if (!item?.idbKey || registry[id]?.hasFiles) continue;
      const buf = await idbGet(item.idbKey);
      if (!buf?.byteLength) continue;
      const mf = manifestFilesForItem(item, manifest)[0];
      if (!mf) continue;
      registry[id] = {
        manifestVersion: manifest.version,
        fileHashes: { [mf.path]: mf.sha256 },
        installedAt: Date.now(),
        bytes: buf.byteLength,
        hasFiles: true,
      };
      changed = true;
    }
    if (changed) saveItemsRegistry(registry);
  })();
}

if (typeof window !== 'undefined') {
  syncLegacyBibleRecords();
}

export function expectedItemBytes(
  item: OfflineCatalogItem,
  manifest: OfflinePackManifest,
): number {
  return manifestFilesForItem(item, manifest).reduce((n, f) => n + f.bytes, 0);
}

export async function getOfflineItemStatus(
  itemId: string,
  manifest?: OfflinePackManifest,
): Promise<OfflineItemStatus> {
  const item = getCatalogItem(itemId);
  if (!item) return 'download';
  const m = manifest ?? (await fetchManifest());
  const record = loadItemRecord(itemId);
  if (!record?.hasFiles) return 'download';
  const expected = manifestFilesForItem(item, m);
  if (!expected.length) return 'download';
  const upToDate = expected.every(
    (f) => record.fileHashes[f.path] === f.sha256,
  );
  return upToDate ? 'ready' : 'update';
}

export async function listOfflineItemStatuses(): Promise<
  Record<string, OfflineItemStatus>
> {
  const manifest = await fetchManifest();
  const out: Record<string, OfflineItemStatus> = {};
  await Promise.all(
    OFFLINE_CATALOG.map(async (item) => {
      out[item.id] = await getOfflineItemStatus(item.id, manifest);
    }),
  );
  return out;
}

/** 单译本优先走 `/offline/bible_*.sqlite` 直链，失败再回落整包 zip。 */
async function tryDownloadSqliteDirect(
  itemId: string,
  manifest: OfflinePackManifest,
  onProgress?: (p: DownloadProgress) => void,
): Promise<boolean> {
  const item = getCatalogItem(itemId);
  if (!item?.idbKey) return false;
  const mf = manifestFilesForItem(item, manifest)[0];

  let fileName: string | undefined;
  let expectedSha: string | undefined;
  let label = item.name;
  if (itemId === 'cuvs') {
    fileName = manifest.cuvs_sqlite || 'bible_cuvs.sqlite';
    expectedSha = manifest.cuvs_sqlite_sha256 || mf?.sha256;
  } else if (itemId === 'contemporary') {
    fileName = manifest.contemporary_sqlite || 'bible_contemporary.sqlite';
    expectedSha = manifest.contemporary_sqlite_sha256 || mf?.sha256;
  } else {
    return false;
  }

  const url = withBasePath(`/offline/${fileName}`);
  try {
    onProgress?.({ phase: 'download', percent: 20, message: `下载${label}…` });
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return false;
    const buf = await res.arrayBuffer();
    if (!buf.byteLength) return false;
    if (expectedSha) {
      onProgress?.({ phase: 'verify', percent: 55, message: `校验${label}…` });
      const got = await sha256Hex(buf);
      if (got !== expectedSha) return false;
    }
    onProgress?.({ phase: 'save', percent: 75, message: `写入${label}…` });
    await idbSet(item.idbKey, buf);
    const path = mf?.path ?? `bible/bible_${itemId}.sqlite`;
    saveItemRecord(itemId, {
      manifestVersion: manifest.version,
      fileHashes: { [path]: expectedSha || (await sha256Hex(buf)) },
      installedAt: Date.now(),
      bytes: buf.byteLength,
      hasFiles: true,
    });
    const { resetLocalBibleDb } = await import('./bible_local');
    resetLocalBibleDb();
    syncPackMetaFromItems(manifest.version);
    window.dispatchEvent(new CustomEvent('presto-offline-pack-ready'));
    return true;
  } catch {
    return false;
  }
}

export async function downloadOfflineItem(
  itemId: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  const item = getCatalogItem(itemId);
  if (!item) throw new Error('未知下载项');

  onProgress?.({ phase: 'manifest', percent: 5, message: '读取清单…' });
  const manifest = await fetchManifest();
  const manifestFiles = manifestFilesForItem(item, manifest);
  if (!manifestFiles.length) throw new Error('清单中缺少对应文件');

  if (itemId === 'cuvs' || itemId === 'contemporary') {
    if (await tryDownloadSqliteDirect(itemId, manifest, onProgress)) {
      onProgress?.({ phase: 'done', percent: 100, message: '完成' });
      return;
    }
  }

  onProgress?.({ phase: 'download', percent: 15, message: `下载${item.name}…` });
  const zipBuf = await fetchOfflineZip(manifest);

  onProgress?.({ phase: 'extract', percent: 45, message: '解压…' });
  const files = await unzipOfflineZip(
    zipBuf,
    manifestFiles.map((f) => f.path),
  );
  const bundle: Record<string, ArrayBuffer> = {};
  const fileHashes: Record<string, string> = {};
  let totalBytes = 0;

  for (const mf of manifestFiles) {
    const entry = findZipEntry(files, mf.path);
    if (!entry) throw new Error(`压缩包内缺少：${mf.path}`);
    const buf = uint8ToArrayBuffer(entry);
    const hash = await sha256Hex(buf);
    if (hash !== mf.sha256) throw new Error(`校验失败：${mf.path}`);
    fileHashes[mf.path] = hash;
    totalBytes += buf.byteLength;

    if (item.kind === 'sqlite' && item.idbKey) {
      onProgress?.({ phase: 'save', percent: 70, message: `写入${item.name}…` });
      await idbSet(item.idbKey, buf);
    } else {
      bundle[mf.path] = buf;
    }
  }

  if (item.kind === 'bundle') {
    onProgress?.({ phase: 'save', percent: 80, message: `写入${item.name}…` });
    await idbSetBundle(bundleIdbKey(item.id), bundle);
  }

  saveItemRecord(itemId, {
    manifestVersion: manifest.version,
    fileHashes,
    installedAt: Date.now(),
    bytes: totalBytes,
    hasFiles: true,
  });

  if (item.kind === 'sqlite') {
    const { resetLocalBibleDb } = await import('./bible_local');
    resetLocalBibleDb();
    syncPackMetaFromItems(manifest.version);
    window.dispatchEvent(new CustomEvent('presto-offline-pack-ready'));
  }

  onProgress?.({ phase: 'done', percent: 100, message: '完成' });
}

export async function deleteOfflineItemFiles(itemId: string): Promise<void> {
  const item = getCatalogItem(itemId);
  if (!item) return;

  if (item.kind === 'sqlite' && item.idbKey) {
    await idbDelete(item.idbKey);
    const { resetLocalBibleDb } = await import('./bible_local');
    resetLocalBibleDb();
  } else {
    await idbDelete(bundleIdbKey(itemId));
  }

  const prev = loadItemRecord(itemId);
  if (prev) {
    saveItemRecord(itemId, {
      ...prev,
      hasFiles: false,
      bytes: 0,
    });
  }

  syncPackMetaFromItems();
}

function syncPackMetaFromItems(version?: string) {
  const registry = loadItemsRegistry();
  const bibleIds = BIBLE_OFFLINE_IDS.filter((id) => registry[id]?.hasFiles);
  if (!bibleIds.length) {
    localStorage.removeItem(OFFLINE_META_KEY);
    return;
  }
  const bytes = bibleIds.reduce((n, id) => n + (registry[id]?.bytes ?? 0), 0);
  savePackMeta({
    version: version ?? loadPackMeta()?.version ?? '',
    translation: bibleIds.length > 1 ? bibleIds.join('+') : bibleIds[0],
    installedAt: Math.max(...bibleIds.map((id) => registry[id]?.installedAt ?? 0)),
    bytes,
    translations: [...bibleIds],
  });
}

export async function loadOfflineBundle(
  itemId: string,
): Promise<Record<string, ArrayBuffer> | null> {
  const record = loadItemRecord(itemId);
  if (!record?.hasFiles) return null;
  return idbGetBundle(bundleIdbKey(itemId));
}

function idbKeyForTranslation(t: OfflineTranslation): string {
  if (t === 'cuvs') return OFFLINE_CUVS_KEY;
  if (t === 'kjv') return OFFLINE_KJV_KEY;
  if (t === 'contemporary') return OFFLINE_CONTEMPORARY_KEY;
  return OFFLINE_CNV_KEY;
}

function uint8ToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

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

export async function purgeOfflineTranslation(translation: OfflineTranslation): Promise<void> {
  await deleteOfflineItemFiles(translation);
}

/** 只看 IDB 是否有字节，不打开 sql.js（避免就绪检查触发整库进内存）。 */
export async function hasOfflineSqliteBytes(
  translation: OfflineTranslation,
): Promise<boolean> {
  const buf = await idbGet(idbKeyForTranslation(translation));
  return Boolean(buf?.byteLength);
}

async function isTranslationOfflineReady(id: OfflineTranslation): Promise<boolean> {
  if ((await getOfflineItemStatus(id)) === 'ready') return true;
  return hasOfflineSqliteBytes(id);
}

export async function isOfflinePackReady(): Promise<boolean> {
  return isTranslationOfflineReady('cnv');
}

export async function isCuvsOfflineReady(): Promise<boolean> {
  return isTranslationOfflineReady('cuvs');
}

export async function isKjvOfflineReady(): Promise<boolean> {
  return isTranslationOfflineReady('kjv');
}

export async function isContemporaryOfflineReady(): Promise<boolean> {
  return isTranslationOfflineReady('contemporary');
}

export async function clearOfflinePack() {
  for (const id of BIBLE_OFFLINE_IDS) {
    await deleteOfflineItemFiles(id);
  }
  localStorage.removeItem(OFFLINE_META_KEY);
}

export type DownloadProgress = {
  phase: 'manifest' | 'download' | 'verify' | 'extract' | 'save' | 'done';
  percent: number;
  message: string;
};

/** 自动预热目标：仅和合本（CUVS）就绪。 */
export async function isAutoBiblePackReady(): Promise<boolean> {
  return isCuvsOfflineReady();
}

/** 后台自动下载：只装和合本（优先直链 sqlite）。 */
export async function downloadAutoBiblePack(
  onProgress?: (p: DownloadProgress) => void,
): Promise<number> {
  if (await isAutoBiblePackReady()) return loadItemRecord('cuvs')?.bytes ?? 0;
  await downloadOfflineItem('cuvs', onProgress);
  return loadItemRecord('cuvs')?.bytes ?? 0;
}

/** 下载并安装全部圣经译本（设置页「全部下载」）。 */
export async function downloadOfflinePack(
  onProgress?: (p: DownloadProgress) => void,
): Promise<number> {
  let total = 0;
  for (const id of BIBLE_OFFLINE_IDS) {
    if ((await getOfflineItemStatus(id)) === 'ready') continue;
    await downloadOfflineItem(id, onProgress);
    total += loadItemRecord(id)?.bytes ?? 0;
  }
  return total;
}

export async function loadOfflineSqliteBytes(
  translation: OfflineTranslation = 'cnv',
): Promise<ArrayBuffer | null> {
  return idbGet(idbKeyForTranslation(translation));
}
