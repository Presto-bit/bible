'use client';

import { useCallback, useEffect, useState } from 'react';
import { SheetCloseButton } from '@/components/PageBackBar';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useToast } from '@/components/ui/ToastProvider';
import {
  catalogItemsForTab,
  formatOfflineBytes,
  type OfflineCatalogItem,
  type OfflineCatalogTab,
} from '@/lib/offline_catalog';
import {
  enqueueOfflineItemDownload,
  getOfflineDownloadSnapshot,
  isOfflineDownloadActive,
  offlineDownloadLabel,
  subscribeOfflineDownload,
} from '@/lib/offline_download_job';
import {
  deleteOfflineItemFiles,
  expectedItemBytes,
  fetchManifest,
  loadItemRecord,
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
  const toast = useToast();
  const [tab, setTab] = useState<OfflineCatalogTab>('bible');
  const [manifest, setManifest] = useState<OfflinePackManifest | null>(null);
  const [statuses, setStatuses] = useState<Record<string, OfflineItemStatus>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [queuedIds, setQueuedIds] = useState<string[]>([]);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  const syncJob = useCallback(() => {
    if (isOfflineDownloadActive()) {
      const snap = getOfflineDownloadSnapshot();
      setBusyId(snap.busyId);
      setQueuedIds(snap.queuedIds);
      setProgressLabel(offlineDownloadLabel(snap));
      if (snap.error) setErr(snap.error);
      return;
    }
    setBusyId(null);
    setQueuedIds([]);
    setProgressLabel(null);
  }, []);

  useEffect(() => {
    void refresh().catch(() => setErr('无法读取下载清单'));
    syncJob();
    return subscribeOfflineDownload(() => {
      syncJob();
      void refresh().catch(() => {});
    });
  }, [refresh, syncJob]);

  const handleClose = () => {
    if (isOfflineDownloadActive()) {
      toast('下载将在后台继续');
    }
    onClose();
  };

  const onDownload = (item: OfflineCatalogItem) => {
    setErr(null);
    void enqueueOfflineItemDownload(item.id)
      .then(() => {
        resetLocalBibleDb();
        void refresh();
      })
      .catch((e) => {
        setErr(e instanceof Error ? e.message : String(e));
      });
  };

  const onDelete = async (item: OfflineCatalogItem) => {
    const ok = await confirm({
      title: `删除「${item.name}」`,
      message: '仅删除本机已下载的文件，记录会保留，之后可重新下载。',
      confirmLabel: '删除',
      danger: true,
    });
    if (!ok) return;
    setDeletingId(item.id);
    setErr(null);
    try {
      await deleteOfflineItemFiles(item.id);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  };

  const items = catalogItemsForTab(tab);
  const anyBusy = Boolean(busyId) || queuedIds.length > 0 || Boolean(deletingId);

  return (
    <AppBodyPortal>
      <div className="sheet-backdrop" onClick={handleClose}>
        <div
          className="sheet card offline-download-sheet"
          onClick={(e) => e.stopPropagation()}
        >
        <div className="offline-download-sheet-head">
        <div className="section-row" style={{ marginTop: 0 }}>
          <h3 style={{ margin: 0 }}>下载</h3>
          <SheetCloseButton onClick={handleClose} />
        </div>
        {progressLabel ? (
          <p className="muted offline-download-progress" role="status">
            {progressLabel}
          </p>
        ) : (
          <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
            按需下载圣经译本与资料，离线可用。关闭本页不会中断下载。
          </p>
        )}

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

        {err ? <p className="offline-download-error">{err}</p> : null}
        </div>

        <div className="offline-download-list">
          {items.map((item) => {
            const itemBusy = busyId === item.id || queuedIds.includes(item.id);
            return (
            <OfflineDownloadRow
              key={item.id}
              item={item}
              manifest={manifest}
              status={statuses[item.id] ?? 'download'}
              busy={itemBusy || deletingId === item.id}
              queued={queuedIds.includes(item.id) && busyId !== item.id}
              disabled={anyBusy && !itemBusy && deletingId !== item.id}
              onDownload={() => onDownload(item)}
              onDelete={() => void onDelete(item)}
            />
            );
          })}
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
  queued,
  disabled,
  onDownload,
  onDelete,
}: {
  item: OfflineCatalogItem;
  manifest: OfflinePackManifest | null;
  status: OfflineItemStatus;
  busy: boolean;
  queued: boolean;
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
            {queued ? '排队中…' : busy ? '处理中…' : actionLabel}
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
