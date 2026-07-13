'use client';

import { useState } from 'react';
import {
  enqueueLocalReadingMigration,
  hasLocalReadingData,
  markSyncMigrated,
} from '@/lib/sync_migrate';
import { syncNow, syncPullFirst } from '@/lib/sync';
import { isFinePointerDesktop, isStandalonePwa } from '@/lib/platform';

type Props = {
  onMerged: () => void;
  onDismiss: () => void;
  onAcknowledged: () => void;
};

/** 首次将本机阅读/成就数据并入账号（按账号仅一次） */
export default function SyncMigrateSheet({ onMerged, onDismiss, onAcknowledged }: Props) {
  const [busy, setBusy] = useState(false);
  const hasData = hasLocalReadingData();
  const desktopLike = typeof window !== 'undefined' && (isFinePointerDesktop() || isStandalonePwa());

  const handleMerge = async () => {
    setBusy(true);
    try {
      await syncPullFirst();
      enqueueLocalReadingMigration();
      await syncNow();
      onMerged();
    } catch {
      onMerged();
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = () => {
    onDismiss();
    // 「暂不保存」仍尽量上行本机阅读，避免重装后云端真空
    if (hasData) {
      try {
        enqueueLocalReadingMigration();
      } catch {
        /* ignore */
      }
      void syncNow().catch(() => {});
    } else {
      void syncPullFirst().catch(() => {});
    }
  };

  const handleAcknowledge = () => {
    markSyncMigrated();
    onAcknowledged();
    void syncPullFirst().catch(() => {});
  };

  const title = desktopLike ? '保存阅读记录到账号' : '同步阅读记录';
  const desc = hasData
    ? desktopLike
      ? '检测到本机有阅读打卡、章节记录或成就。保存到账号后，桌面 App 重装或换设备登录也能找回。'
      : '检测到本机有阅读打卡、章节记录或成就。将先从云端拉取已有数据，再合并本机记录，避免覆盖其他设备上的进度。'
    : desktopLike
      ? '设置账号并保存后，读经记录会留在账号里，便于桌面 App 重装后恢复。'
      : '开启后，阅读打卡与成就会在多设备间保持一致。';

  return (
    <div className="sheet-backdrop" role="presentation" onClick={() => !busy && handleDismiss()}>
      <div
        className="sheet sync-migrate-sheet"
        role="dialog"
        aria-labelledby="sync-migrate-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="sync-migrate-title">{title}</h2>
        <p className="sync-migrate-desc">{desc}</p>
        <div className="sync-migrate-actions">
          {hasData ? (
            <button type="button" className="btn primary" disabled={busy} onClick={() => void handleMerge()}>
              {busy ? '保存中…' : desktopLike ? '保存到账号' : '合并到账号'}
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
            {hasData ? (desktopLike ? '暂不保存' : '暂不合并') : '关闭'}
          </button>
        </div>
      </div>
    </div>
  );
}
