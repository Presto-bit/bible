'use client';

import { useEffect, useState } from 'react';
import { currentUserId, effectiveId, ensureAccountReady, hasPassword, api } from '@/lib/api';
import { scheduleOfflinePackAutoDownload } from '@/lib/offline_bootstrap';
import { flushCheckinQueue } from '@/lib/checkin_queue';
import { rescheduleGroupEveningReminder } from '@/lib/group_reminder';
import {
  syncNow,
  syncPullFirst,
  syncResyncAccount,
  pendingCount,
  pullReadingStateByUser,
  flushOutboxKeepalive,
  initializeCloudSyncQueue,
} from '@/lib/sync';
import { forceMarkSyncIdle } from '@/lib/sync_status';
import {
  enqueueLocalReadingMigration,
  hasLocalReadingData,
  needsCloudReadingRestore,
  needsSyncMigration,
} from '@/lib/sync_migrate';
import {
  backupLocalReadingSnapshot,
  restoreLocalReadingSnapshotIfNeeded,
} from '@/lib/reading_durable';
import { isStandalonePwa } from '@/lib/platform';
import { notifyLocalDataChanged } from '@/lib/local_data_events';
import BadgeUnlockToast from '@/components/BadgeUnlockToast';
import RestoreAccountSheet from '@/components/RestoreAccountSheet';

const RESTORE_PROMPT_DISMISS_KEY = 'presto_restore_prompt_dismissed';

/** 默认同步本机阅读到账号（不再弹窗确认） */
async function autoSaveReadingToAccount(): Promise<void> {
  try {
    await syncPullFirst();
    enqueueLocalReadingMigration();
    await syncNow();
    const uid = currentUserId() || effectiveId();
    if (uid) await backupLocalReadingSnapshot(uid);
    notifyLocalDataChanged('auto-migrate-reading');
  } catch {
    try {
      enqueueLocalReadingMigration();
    } catch {
      /* ignore */
    }
    void syncNow().catch(() => {});
  }
}

/**
 * 按用户 ID 恢复最新读经：IDB → 专用 reading-state 快照 →（仍空则）全量 sync。
 * 注意：勿在启动关键路径上长时间 await，以免拖慢圣经 Tab 首屏。
 */
async function restoreReadingForAccount(uid: string): Promise<void> {
  const fromIdb = await restoreLocalReadingSnapshotIfNeeded(uid);
  if (fromIdb) notifyLocalDataChanged('idb-reading-restore');

  // 本机已有读经时只做轻量快照合并，避免每次启动全量 sync 占满带宽
  const hadLocal = !needsCloudReadingRestore();

  try {
    await pullReadingStateByUser();
    notifyLocalDataChanged('cloud-reading-restore');
  } catch {
    if (!hadLocal) {
      try {
        await syncResyncAccount();
        notifyLocalDataChanged('cloud-reading-restore');
      } catch {
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          void syncNow().catch(() => {});
        }
      }
    }
  }

  if (needsCloudReadingRestore()) {
    try {
      await syncResyncAccount();
      notifyLocalDataChanged('cloud-reading-restore');
    } catch {
      /* ignore */
    }
  }

  await backupLocalReadingSnapshot(uid);
}

/** 应用启动：身份 → 建档 → 云同步（后台）→ 离线经包 */
export default function IdentityShell({ children }: { children: React.ReactNode }) {
  const [restoreSheet, setRestoreSheet] = useState(false);

  useEffect(() => {
    const runBackgroundSync = () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      void syncNow().catch(() => {});
    };
    void ensureAccountReady().then(() => {
      // 一次性初始化：清掉今天未同步/卡住的 outbox，解除「同步中」死锁
      forceMarkSyncIdle();
      initializeCloudSyncQueue();

      // 显式 UV 打点（有设备头），避免仅靠中间件静默失败导致看板为 0
      void api.analyticsVisit().catch(() => {});

      const uid = currentUserId() || effectiveId();
      const loggedInWithPwd = Boolean(currentUserId() && hasPassword());
      const standalone = isStandalonePwa();
      const restoreDismissed =
        typeof window !== 'undefined' &&
        sessionStorage.getItem(RESTORE_PROMPT_DISMISS_KEY) === '1';

      // 迁移 / 读经恢复放到 idle，避免与首页 bootstrap 抢带宽
      const runRestore = () => {
        void (async () => {
          if (needsSyncMigration()) {
            await autoSaveReadingToAccount();
          }
          if (uid) {
            await restoreReadingForAccount(uid);
          }
          runBackgroundSync();
        })();
      };
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(() => runRestore(), { timeout: 8000 });
      } else {
        window.setTimeout(runRestore, 3000);
      }

      // 重装空数据时提示恢复；设密改「我的」软催，不再首访弹门闸
      const showRestore =
        standalone &&
        !loggedInWithPwd &&
        !hasLocalReadingData() &&
        !restoreDismissed;

      if (showRestore) {
        setRestoreSheet(true);
      }

      void flushCheckinQueue().catch(() => {});
      rescheduleGroupEveningReminder();
      void import('@/lib/bible_warmup').then((m) => m.scheduleBibleWarmup());
      // 经包延后到首页就绪后，避免 ~26MB zip 拖慢冷启动
      scheduleOfflinePackAutoDownload();
    });
    const onOnline = () => {
      void flushCheckinQueue().catch(() => {});
      const uid = currentUserId() || effectiveId();
      if (uid) void restoreReadingForAccount(uid);
      else runBackgroundSync();
    };
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const uid = currentUserId() || effectiveId();
      if (uid && needsCloudReadingRestore()) {
        void restoreReadingForAccount(uid);
        return;
      }
      runBackgroundSync();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    const onPageHide = () => {
      const uid = currentUserId() || effectiveId();
      if (uid) void backupLocalReadingSnapshot(uid);
      flushOutboxKeepalive();
    };
    window.addEventListener('pagehide', onPageHide);
    const syncInterval = window.setInterval(() => {
      if (pendingCount() > 0) runBackgroundSync();
      const uid = currentUserId() || effectiveId();
      if (uid && hasLocalReadingData()) void backupLocalReadingSnapshot(uid);
    }, 30000);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', onPageHide);
      window.clearInterval(syncInterval);
    };
  }, []);

  const dismissRestore = () => {
    try {
      sessionStorage.setItem(RESTORE_PROMPT_DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setRestoreSheet(false);
  };

  return (
    <>
      {children}
      <BadgeUnlockToast />
      {restoreSheet ? <RestoreAccountSheet onDismiss={dismissRestore} /> : null}
    </>
  );
}
