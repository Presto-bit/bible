'use client';

import { useEffect, useState } from 'react';
import { currentUserId, ensureAccountReady, hasPassword } from '@/lib/api';
import { shouldPromptUsername } from '@/lib/account_guide';
import { ensureOfflinePackAutoDownload } from '@/lib/offline_bootstrap';
import { flushCheckinQueue } from '@/lib/checkin_queue';
import { rescheduleGroupEveningReminder } from '@/lib/group_reminder';
import { syncNow, syncResyncAccount, pendingCount } from '@/lib/sync';
import { hasLocalReadingData, needsSyncMigration } from '@/lib/sync_migrate';
import { isStandalonePwa } from '@/lib/platform';
import BadgeUnlockToast from '@/components/BadgeUnlockToast';
import UsernameGuideSheet from '@/components/UsernameGuideSheet';
import SyncMigrateSheet from '@/components/SyncMigrateSheet';
import RestoreAccountSheet from '@/components/RestoreAccountSheet';

const RESTORE_PROMPT_DISMISS_KEY = 'presto_restore_prompt_dismissed';

/** 应用启动：身份 → 建档 → 云同步 → 离线经包 */
export default function IdentityShell({ children }: { children: React.ReactNode }) {
  const [usernameGuide, setUsernameGuide] = useState(false);
  const [migrateSheet, setMigrateSheet] = useState(false);
  const [restoreSheet, setRestoreSheet] = useState(false);

  useEffect(() => {
    const runBackgroundSync = () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      void syncNow().catch(() => {});
    };
    void ensureAccountReady().then(() => {
      const loggedInWithPwd = Boolean(currentUserId() && hasPassword());
      const emptyLocal = !hasLocalReadingData();
      const standalone = isStandalonePwa();
      const restoreDismissed =
        typeof window !== 'undefined' &&
        sessionStorage.getItem(RESTORE_PROMPT_DISMISS_KEY) === '1';

      if (needsSyncMigration()) {
        setMigrateSheet(true);
        // 弹窗期间仍后台刷出box，避免读完立刻卸 App 导致云端无数据
        runBackgroundSync();
      } else if (standalone && loggedInWithPwd && emptyLocal) {
        // 已登录但本机空（例如重装后会话残留 / 未拉完）：强制全量拉回
        void syncResyncAccount().catch(() => runBackgroundSync());
      } else if (standalone && !loggedInWithPwd && emptyLocal && !restoreDismissed) {
        // 重装后新游客：引导登录账号恢复
        setRestoreSheet(true);
        runBackgroundSync();
      } else {
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
      if (document.visibilityState === 'visible') runBackgroundSync();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    const onPageHide = () => {
      if (pendingCount() > 0) runBackgroundSync();
    };
    window.addEventListener('pagehide', onPageHide);
    const syncInterval = window.setInterval(() => {
      if (pendingCount() > 0) runBackgroundSync();
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
      {migrateSheet ? (
        <SyncMigrateSheet
          onMerged={() => setMigrateSheet(false)}
          onDismiss={() => setMigrateSheet(false)}
          onAcknowledged={() => setMigrateSheet(false)}
        />
      ) : null}
      {restoreSheet && !migrateSheet ? (
        <RestoreAccountSheet onDismiss={dismissRestore} />
      ) : null}
      {usernameGuide ? <UsernameGuideSheet onDone={() => setUsernameGuide(false)} /> : null}
    </>
  );
}
