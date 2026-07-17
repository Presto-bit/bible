'use client';

/** 阅读器「选择版本」弹层：已下载可勾选；未下载可下；下载中显示进度；失败可重试。 */

import { useCallback, useEffect, useState } from 'react';
import type { BibleVersion } from '@/lib/api';
import { getCatalogItem } from '@/lib/offline_catalog';
import {
  enqueueOfflineItemDownload,
  getOfflineDownloadSnapshot,
  subscribeOfflineDownload,
  type OfflineDownloadSnapshot,
} from '@/lib/offline_download_job';
import {
  getOfflineItemStatus,
  type OfflineItemStatus,
} from '@/lib/offline_pack';
import { resetLocalBibleDb } from '@/lib/bible_local';

export type VersionPickerCopy = {
  title: string;
  hint: string;
  done: string;
  downloaded: string;
  download: string;
  downloading: string;
  retry: string;
  unavailable: string;
};

type Props = {
  versions: BibleVersion[];
  checkedIds: string[];
  copy: VersionPickerCopy;
  onApplySelection: (next: string[]) => void;
  onClose: () => void;
};

function hasOfflineCatalog(versionId: string): boolean {
  const item = getCatalogItem(versionId);
  return Boolean(item && item.tab === 'bible');
}

function isLocalReady(status: OfflineItemStatus | undefined): boolean {
  return status === 'ready' || status === 'update';
}

export default function VersionPickerPop({
  versions,
  checkedIds,
  copy,
  onApplySelection,
  onClose,
}: Props) {
  const [localStatus, setLocalStatus] = useState<Record<string, OfflineItemStatus>>({});
  const [failedIds, setFailedIds] = useState<Record<string, true>>({});
  const [snap, setSnap] = useState<OfflineDownloadSnapshot>(() =>
    getOfflineDownloadSnapshot(),
  );

  const refreshLocal = useCallback(async () => {
    const bibleIds = versions.map((v) => v.id).filter(hasOfflineCatalog);
    const next: Record<string, OfflineItemStatus> = {};
    await Promise.all(
      bibleIds.map(async (id) => {
        try {
          next[id] = await getOfflineItemStatus(id);
        } catch {
          next[id] = 'download';
        }
      }),
    );
    setLocalStatus(next);
  }, [versions]);

  useEffect(() => {
    void refreshLocal();
    const sync = () => setSnap(getOfflineDownloadSnapshot());
    sync();
    return subscribeOfflineDownload(() => {
      sync();
      void refreshLocal();
    });
  }, [refreshLocal]);

  const primaryId = versions.find((v) => v.primary)?.id ?? 'cnv';

  const canSelect = (vv: BibleVersion) => {
    if (hasOfflineCatalog(vv.id)) return isLocalReady(localStatus[vv.id]);
    return vv.available;
  };

  const toggleSelect = (id: string) => {
    let next = [...checkedIds];
    const checked = next.includes(id);
    if (checked) {
      if (id === primaryId && next.length === 1) return;
      next = next.filter((x) => x !== id);
      if (next.length === 0) next = [primaryId];
    } else if (next.length < 2) {
      next.push(id);
    } else {
      next = [next[0], id];
    }
    onApplySelection(next);
  };

  const startDownload = (id: string) => {
    if (!hasOfflineCatalog(id)) return;
    setFailedIds((prev) => {
      if (!prev[id]) return prev;
      const n = { ...prev };
      delete n[id];
      return n;
    });
    void enqueueOfflineItemDownload(id)
      .then(async () => {
        resetLocalBibleDb();
        await refreshLocal();
        // 下完自动勾选（保持最多 2 本）
        let next = [...checkedIds];
        if (!next.includes(id)) {
          if (next.length < 2) next = [...next, id];
          else next = [next[0], id];
        }
        onApplySelection(next);
      })
      .catch(() => {
        setFailedIds((prev) => ({ ...prev, [id]: true }));
      });
  };

  return (
    <div className="version-pop-backdrop" onClick={onClose}>
      <div className="version-pop card" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{copy.title}</h3>
        <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
          {copy.hint}
        </p>
        {versions.map((vv) => {
          const catalogued = hasOfflineCatalog(vv.id);
          const localReady = catalogued && isLocalReady(localStatus[vv.id]);
          const downloading =
            catalogued &&
            (snap.busyId === vv.id || snap.queuedIds.includes(vv.id));
          const failed = catalogued && Boolean(failedIds[vv.id]) && !downloading;
          const selectable = canSelect(vv);
          const checked = checkedIds.includes(vv.id) && selectable;
          const pct =
            snap.busyId === vv.id && snap.progress?.percent
              ? Math.round(snap.progress.percent)
              : 0;

          let trailing: string;
          if (downloading) {
            trailing =
              pct > 0 ? `${copy.downloading} ${pct}%` : copy.downloading;
          } else if (failed) {
            trailing = copy.retry;
          } else if (localReady) {
            trailing = copy.downloaded;
          } else if (catalogued) {
            trailing = copy.download;
          } else if (vv.available) {
            trailing = copy.downloaded;
          } else {
            trailing = copy.unavailable;
          }

          const actionClickable =
            failed || (!localReady && catalogued && !downloading);

          const onRowClick = () => {
            if (downloading) return;
            if (failed) {
              startDownload(vv.id);
              return;
            }
            if (catalogued && !localReady) {
              startDownload(vv.id);
              return;
            }
            if (selectable) toggleSelect(vv.id);
          };

          return (
            <div
              key={vv.id}
              className={`version-row${checked ? ' version-row-active' : ''}${
                downloading ? ' version-row-busy' : ''
              }${!selectable && !catalogued ? ' version-row-disabled' : ''}`}
              role="button"
              tabIndex={selectable || catalogued ? 0 : -1}
              onClick={onRowClick}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onRowClick();
                }
              }}
            >
              <span className="version-row-label">
                <span>{vv.label}</span>
                {checked ? (
                  <span className="muted version-row-check">✓</span>
                ) : null}
              </span>
              {actionClickable ? (
                <button
                  type="button"
                  className="version-row-action"
                  onClick={(e) => {
                    e.stopPropagation();
                    startDownload(vv.id);
                  }}
                >
                  {trailing}
                </button>
              ) : (
                <span
                  className={`version-row-action version-row-action-muted${
                    downloading ? ' version-row-action-busy' : ''
                  }`}
                >
                  {trailing}
                </span>
              )}
            </div>
          );
        })}
        <button
          type="button"
          className="btn"
          style={{ width: '100%', marginTop: 12 }}
          onClick={onClose}
        >
          {copy.done}
        </button>
      </div>
    </div>
  );
}
