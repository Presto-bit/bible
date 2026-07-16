'use client';

import { useCallback, useEffect, useState } from 'react';
import { SheetCloseButton } from '@/components/PageBackBar';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import {
  catalogItemsForTab,
  formatOfflineBytes,
  type OfflineCatalogItem,
  type OfflineCatalogTab,
} from '@/lib/offline_catalog';
import {
  deleteOfflineItemFiles,
  downloadOfflineItem,
  expectedItemBytes,
  fetchManifest,
  loadItemRecord,
  releaseOfflineZipCache,
  type DownloadProgress,
  type OfflineItemStatus,
  type OfflinePackManifest,
} from '@/lib/offline_pack';
import { resetLocalBibleDb } from '@/lib/bible_local';
import AppBodyPortal from '@/components/AppBodyPortal';

type Props = {
  onClose: () => void;
};

export default function OfflineDownloadSheet({ onClose }: Props) {
  const confirm = useConfirm();
  const [tab, setTab] = useState<OfflineCatalogTab>('bible');
  const [manifest, setManifest] = useState<OfflinePackManifest | null>(null);
  const [statuses, setStatuses] = useState<Record<string, OfflineItemStatus>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const m = await fetchManifest();
    setManifest(m);
    const next: Record<string, OfflineItemStatus> = {};
    for (const item of catalogItemsForTab('bible').concat(catalogItemsForTab('materials'))) {
      const record = loadItemRecord(item.id);
      if (!record?.hasFiles) {
        next[item.id] = 'download';
        continue;
      }
      const expected = item.paths?.length
        ? m.files.filter((f) => item.paths!.includes(f.path))
        : m.files.filter((f) => item.pathsPrefix && f.path.startsWith(item.pathsPrefix));
      const upToDate = expected.length > 0 && expected.every(
        (f) => record.fileHashes[f.path] === f.sha256,
      );
      next[item.id] = upToDate ? 'ready' : 'update';
    }
    setStatuses(next);
  }, []);

  useEffect(() => {
    void refresh().catch(() => setErr('无法读取下载清单'));
    return () => {
      releaseOfflineZipCache();
    };
  }, [refresh]);

  const onDownload = async (item: OfflineCatalogItem) => {
    setBusyId(item.id);
    setErr(null);
    try {
      await downloadOfflineItem(item.id, setProgress);
      resetLocalBibleDb();
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
      setProgress(null);
    }
  };

  const onDelete = async (item: OfflineCatalogItem) => {
    const ok = await confirm({
      title: `删除「${item.name}」`,
      message: '仅删除本机已下载的文件，记录会保留，之后可重新下载。',
      confirmLabel: '删除',
      danger: true,
    });
    if (!ok) return;
    setBusyId(item.id);
    setErr(null);
    try {
      await deleteOfflineItemFiles(item.id);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const items = catalogItemsForTab(tab);

  return (
    <AppBodyPortal>
      <div className="sheet-backdrop" onClick={onClose}>
        <div
          className="sheet card offline-download-sheet"
          onClick={(e) => e.stopPropagation()}
        >
        <div className="offline-download-sheet-head">
        <div className="section-row" style={{ marginTop: 0 }}>
          <h3 style={{ margin: 0 }}>下载</h3>
          <SheetCloseButton onClick={onClose} />
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
          按需下载圣经译本与资料，离线可用。删除仅清除本机文件，不删除记录。
        </p>

        <div className="seg-tabs offline-download-tabs" style={{ marginTop: 12 }}>
          <button
            type="button"
            className={`seg-tab${tab === 'bible' ? ' seg-tab-active' : ''}`}
            onClick={() => setTab('bible')}
          >
            圣经
          </button>
          <button
            type="button"
            className={`seg-tab${tab === 'materials' ? ' seg-tab-active' : ''}`}
            onClick={() => setTab('materials')}
          >
            资料
          </button>
        </div>

        {progress && busyId ? (
          <p className="muted offline-download-progress">
            {progress.message}
            {progress.percent > 0 ? ` ${progress.percent}%` : ''}
          </p>
        ) : null}
        {err ? <p className="offline-download-error">{err}</p> : null}
        </div>

        <div className="offline-download-list">
          {items.map((item) => (
            <OfflineDownloadRow
              key={item.id}
              item={item}
              manifest={manifest}
              status={statuses[item.id] ?? 'download'}
              busy={busyId === item.id}
              disabled={Boolean(busyId && busyId !== item.id)}
              onDownload={() => void onDownload(item)}
              onDelete={() => void onDelete(item)}
            />
          ))}
        </div>
      </div>
    </div>
    </AppBodyPortal>
  );
}

function OfflineDownloadRow({
  item,
  manifest,
  status,
  busy,
  disabled,
  onDownload,
  onDelete,
}: {
  item: OfflineCatalogItem;
  manifest: OfflinePackManifest | null;
  status: OfflineItemStatus;
  busy: boolean;
  disabled: boolean;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const sizeLabel = manifest ? formatOfflineBytes(expectedItemBytes(item, manifest)) : '';
  const record = loadItemRecord(item.id);
  const actionLabel = status === 'update' ? '更新' : '下载';
  const showDelete = status === 'ready' || status === 'update';

  return (
    <div className="offline-download-row">
      <div className="offline-download-row-main">
        <strong>{item.name}</strong>
        {item.description ? (
          <span className="muted offline-download-row-desc">{item.description}</span>
        ) : null}
        {sizeLabel ? (
          <span className="muted offline-download-row-size">{sizeLabel}</span>
        ) : null}
        {record?.hasFiles && record.bytes > 0 ? (
          <span className="muted offline-download-row-size">
            已下载 {formatOfflineBytes(record.bytes)}
          </span>
        ) : null}
      </div>
      <div className="offline-download-row-actions">
        {status !== 'ready' ? (
          <button
            type="button"
            className="font-pill"
            disabled={disabled || busy}
            onClick={onDownload}
          >
            {busy ? '处理中…' : actionLabel}
          </button>
        ) : null}
        {showDelete ? (
          <button
            type="button"
            className="font-pill font-pill-muted"
            disabled={disabled || busy}
            onClick={onDelete}
          >
            删除
          </button>
        ) : null}
      </div>
    </div>
  );
}
