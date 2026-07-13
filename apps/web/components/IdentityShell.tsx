'use client';

import { useEffect, useState } from 'react';
import { currentUserId, effectiveId, ensureAccountReady, hasPassword } from '@/lib/api';
import { shouldPromptUsername } from '@/lib/account_guide';
import { ensureOfflinePackAutoDownload } from '@/lib/offline_bootstrap';
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
import UsernameGuideSheet from '@/components/UsernameGuideSheet';
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
 */
async function restoreReadingForAccount(uid: string): Promise<void> {
  const fromIdb = await restoreLocalReadingSnapshotIfNeeded(uid);
  if (fromIdb) notifyLocalDataChanged('idb-reading-restore');

  try {
    await pullReadingStateByUser();
    notifyLocalDataChanged('cloud-reading-restore');
  } catch {
    /* 快照失败时再走全量 */
    try {
      await syncResyncAccount();
      notifyLocalDataChanged('cloud-reading-restore');
    } catch {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        void syncNow().catch(() => {});
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

/** 应用启动：身份 → 建档 → 按用户 ID 同步读经 → 离线经包 */
export default function IdentityShell({ children }: { children: React.ReactNode }) {
  const [usernameGuide, setUsernameGuide] = useState(false);
  const [restoreSheet, setRestoreSheet] = useState(false);

  useEffect(() => {
    const runBackgroundSync = () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      void syncNow().catch(() => {});
    };
    void ensureAccountReady().then(async () => {
      // 一次性初始化：清掉今天未同步/卡住的 outbox，解除「同步中」死锁
      forceMarkSyncIdle();
      initializeCloudSyncQueue();

      const uid = currentUserId() || effectiveId();
      const loggedInWithPwd = Boolean(currentUserId() && hasPassword());
      const standalone = isStandalonePwa();
      const restoreDismissed =
        typeof window !== 'undefined' &&
        sessionStorage.getItem(RESTORE_PROMPT_DISMISS_KEY) === '1';

      if (needsSyncMigration()) {
        await autoSaveReadingToAccount();
      }

      // 只要有用户 ID：每次启动都按 ID 拉最新读经（合并本地），解决删 PWA 后同 ID 无历史
      if (uid) {
        await restoreReadingForAccount(uid);
      }
      runBackgroundSync();

      if (
        standalone &&
        !loggedInWithPwd &&
        !hasLocalReadingData() &&
        !restoreDismissed
      ) {
        setRestoreSheet(true);
      }

      void flushCheckinQueue().catch(() => {});
      rescheduleGroupEveningReminder();
      void ensureOfflinePackAutoDownload();
      if (shouldPromptUsername()) setUsernameGuide(true);
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
      {usernameGuide ? <UsernameGuideSheet onDone={() => setUsernameGuide(false)} /> : null}
    </>
  );
}
