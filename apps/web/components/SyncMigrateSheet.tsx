'use client';

import { useState } from 'react';
import {
  enqueueLocalReadingMigration,
  hasLocalReadingData,
  markSyncMigrated,
} from '@/lib/sync_migrate';
import { syncNow, syncPullFirst } from '@/lib/sync';

type Props = {
  onMerged: () => void;
  onDismiss: () => void;
  onAcknowledged: () => void;
};

/** 首次将本机阅读/成就数据并入账号（按账号仅一次） */
export default function SyncMigrateSheet({ onMerged, onDismiss, onAcknowledged }: Props) {
  const [busy, setBusy] = useState(false);
  const hasData = hasLocalReadingData();

  const handleMerge = async () => {
    setBusy(true);
    try {
      await syncPullFirst();
      enqueueLocalReadingMigration();
      await syncNow();
      onMerged();
    } catch {
      /* 离线时 outbox 已入队 */
      onMerged();
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = () => {
    onDismiss();
    void syncPullFirst().catch(() => {});
  };

  const handleAcknowledge = () => {
    markSyncMigrated();
    onAcknowledged();
    void syncPullFirst().catch(() => {});
  };

  return (
    <div className="sheet-backdrop" role="presentation" onClick={() => !busy && handleDismiss()}>
      <div
        className="sheet sync-migrate-sheet"
        role="dialog"
        aria-labelledby="sync-migrate-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="sync-migrate-title">同步阅读记录</h2>
        <p className="sync-migrate-desc">
          {hasData
            ? '检测到本机有阅读打卡、章节记录或成就。将先从云端拉取已有数据，再合并本机记录，避免覆盖其他设备上的进度。'
            : '开启云同步后，阅读打卡与成就会在多设备间保持一致。'}
        </p>
        <div className="sync-migrate-actions">
          {hasData ? (
            <button type="button" className="btn primary" disabled={busy} onClick={() => void handleMerge()}>
              {busy ? '合并中…' : '合并到账号'}
            </button>
          ) : (
            <button type="button" className="btn primary" disabled={busy} onClick={() => handleAcknowledge()}>
              知道了
            </button>
          )}
          <button
            type="button"
            className="btn ghost"
            disabled={busy}
            onClick={() => (hasData ? handleDismiss() : handleAcknowledge())}
          >
            {hasData ? '暂不合并' : '关闭'}
          </button>
        </div>
      </div>
    </div>
  );
}
