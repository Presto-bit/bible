'use client';

import { useEffect, useState } from 'react';
import { currentUserId, effectiveId, ensureAccountReady, hasPassword } from '@/lib/api';
import { shouldPromptUsername } from '@/lib/account_guide';
import { ensureOfflinePackAutoDownload } from '@/lib/offline_bootstrap';
import { flushCheckinQueue } from '@/lib/checkin_queue';
import { rescheduleGroupEveningReminder } from '@/lib/group_reminder';
import { syncNow, syncPullFirst, syncResyncAccount, pendingCount } from '@/lib/sync';
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

function cloudRestoreAttemptKey(uid: string) {
  return `presto_cloud_restore_attempted:${uid}`;
}

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

async function restoreReadingForAccount(uid: string): Promise<void> {
  // 1) 先从 IDB 快照回填（删桌面图标后 localStorage 常空、IDB 仍在）
  const fromIdb = await restoreLocalReadingSnapshotIfNeeded(uid);
  if (fromIdb) notifyLocalDataChanged('idb-reading-restore');

  // 2) 仍空或不完整：全量拉云端（不依赖本地 hasPassword 缓存）
  if (needsCloudReadingRestore() || !hasLocalReadingData()) {
    try {
      await syncResyncAccount();
      notifyLocalDataChanged('cloud-reading-restore');
      await backupLocalReadingSnapshot(uid);
    } catch {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        void syncNow().catch(() => {});
      }
    }
  } else {
    void backupLocalReadingSnapshot(uid);
  }
}

/** 应用启动：身份 → 建档 → 云同步 → 离线经包 */
export default function IdentityShell({ children }: { children: React.ReactNode }) {
  const [usernameGuide, setUsernameGuide] = useState(false);
  const [restoreSheet, setRestoreSheet] = useState(false);

  useEffect(() => {
    const runBackgroundSync = () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      void syncNow().catch(() => {});
    };
    void ensureAccountReady().then(async () => {
      const uid = currentUserId() || effectiveId();
      const loggedInWithPwd = Boolean(currentUserId() && hasPassword());
      const standalone = isStandalonePwa();
      const restoreDismissed =
        typeof window !== 'undefined' &&
        sessionStorage.getItem(RESTORE_PROMPT_DISMISS_KEY) === '1';
      const restoreAttempted =
        Boolean(uid) &&
        typeof window !== 'undefined' &&
        sessionStorage.getItem(cloudRestoreAttemptKey(uid)) === '1';

      if (needsSyncMigration()) {
        await autoSaveReadingToAccount();
      } else if (uid && needsCloudReadingRestore() && !restoreAttempted) {
        // 相同 user_id + 本机读经空：先 IDB 再云端全量拉
        try {
          sessionStorage.setItem(cloudRestoreAttemptKey(uid), '1');
        } catch {
          /* ignore */
        }
        await restoreReadingForAccount(uid);
        // 若仍空，允许本会话在 visibility 时再试一次
        if (needsCloudReadingRestore()) {
          try {
            sessionStorage.removeItem(cloudRestoreAttemptKey(uid));
          } catch {
            /* ignore */
          }
        }
      } else if (
        standalone &&
        !loggedInWithPwd &&
        !hasLocalReadingData() &&
        !restoreDismissed
      ) {
        setRestoreSheet(true);
        runBackgroundSync();
      } else {
        if (uid) void backupLocalReadingSnapshot(uid);
        runBackgroundSync();
      }
      void flushCheckinQueue().catch(() => {});
      rescheduleGroupEveningReminder();
      void ensureOfflinePackAutoDownload();
      if (shouldPromptUsername()) setUsernameGuide(true);
    });
    const onOnline = () => {
      void flushCheckinQueue().catch(() => {});
      runBackgroundSync();
    };
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const uid = currentUserId() || effectiveId();
      if (
        uid &&
        needsCloudReadingRestore() &&
        sessionStorage.getItem(cloudRestoreAttemptKey(uid)) !== '1'
      ) {
        try {
          sessionStorage.setItem(cloudRestoreAttemptKey(uid), '1');
        } catch {
          /* ignore */
        }
        void restoreReadingForAccount(uid).then(() => {
          if (needsCloudReadingRestore()) {
            try {
              sessionStorage.removeItem(cloudRestoreAttemptKey(uid));
            } catch {
              /* ignore */
            }
          }
        });
        return;
      }
      runBackgroundSync();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    const onPageHide = () => {
      const uid = currentUserId() || effectiveId();
      if (uid) void backupLocalReadingSnapshot(uid);
      if (pendingCount() > 0) runBackgroundSync();
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
