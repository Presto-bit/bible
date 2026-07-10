'use client';

import { useEffect, useState } from 'react';
import { ensureAccountReady } from '@/lib/api';
import { shouldPromptUsername } from '@/lib/account_guide';
import { ensureOfflinePackAutoDownload } from '@/lib/offline_bootstrap';
import { flushCheckinQueue } from '@/lib/checkin_queue';
import { rescheduleGroupEveningReminder } from '@/lib/group_reminder';
import { syncNow, pendingCount } from '@/lib/sync';
import { needsSyncMigration, markSyncMigrated } from '@/lib/sync_migrate';
import BadgeUnlockToast from '@/components/BadgeUnlockToast';
import UsernameGuideSheet from '@/components/UsernameGuideSheet';
import SyncMigrateSheet from '@/components/SyncMigrateSheet';

/** 应用启动：身份 → 建档 → 云同步 → 离线经包 */
export default function IdentityShell({ children }: { children: React.ReactNode }) {
  const [usernameGuide, setUsernameGuide] = useState(false);
  const [migrateSheet, setMigrateSheet] = useState(false);

  useEffect(() => {
    const runBackgroundSync = () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      void syncNow().catch(() => {});
    };
    void ensureAccountReady().then(() => {
      if (needsSyncMigration()) {
        setMigrateSheet(true);
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
    const syncInterval = window.setInterval(() => {
      if (pendingCount() > 0) runBackgroundSync();
    }, 30000);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(syncInterval);
    };
  }, []);

  return (
    <>
      {children}
      <BadgeUnlockToast />
      {migrateSheet ? (
        <SyncMigrateSheet
          onDone={() => {
            markSyncMigrated();
            setMigrateSheet(false);
          }}
        />
      ) : null}
      {usernameGuide ? <UsernameGuideSheet onDone={() => setUsernameGuide(false)} /> : null}
    </>
  );
}
