'use client';

import { useState } from 'react';
import { enqueueLocalReadingMigration, hasLocalReadingData } from '@/lib/sync_migrate';
import { syncNow } from '@/lib/sync';

type Props = {
  onDone: () => void;
};

/** 首次将本机阅读/成就数据并入账号（仅一次） */
export default function SyncMigrateSheet({ onDone }: Props) {
  const [busy, setBusy] = useState(false);
  const hasData = hasLocalReadingData();

  const finish = () => {
    onDone();
    void syncNow().catch(() => {});
  };

  const handleMerge = async () => {
    setBusy(true);
    try {
      enqueueLocalReadingMigration();
      await syncNow();
    } catch {
      /* 离线时 outbox 已入队 */
    } finally {
      setBusy(false);
      finish();
    }
  };

  return (
    <div className="sheet-backdrop" role="presentation" onClick={() => !busy && finish()}>
      <div
        className="sheet sync-migrate-sheet"
        role="dialog"
        aria-labelledby="sync-migrate-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="sync-migrate-title">同步阅读记录</h2>
        <p className="muted">
          {hasData
            ? '检测到本机有阅读打卡、章节记录或成就。合并到账号后，手机与电脑将显示一致的连续天数与进度。'
            : '开启云同步后，阅读打卡与成就会在多设备间保持一致。'}
        </p>
        <div className="sync-migrate-actions">
          {hasData ? (
            <button type="button" className="btn primary" disabled={busy} onClick={() => void handleMerge()}>
              {busy ? '合并中…' : '合并到账号'}
            </button>
          ) : (
            <button type="button" className="btn primary" disabled={busy} onClick={() => finish()}>
              知道了
            </button>
          )}
          <button type="button" className="btn ghost" disabled={busy} onClick={() => finish()}>
            {hasData ? '暂不合并' : '关闭'}
          </button>
        </div>
      </div>
    </div>
  );
}
