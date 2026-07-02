'use client';

import { useEffect, useState } from 'react';
import { ensureAccountReady } from '@/lib/api';
import { shouldPromptUsername } from '@/lib/account_guide';
import { ensureOfflinePackAutoDownload } from '@/lib/offline_bootstrap';
import { syncNow } from '@/lib/sync';
import UsernameGuideSheet from '@/components/UsernameGuideSheet';

/** 应用启动：身份 → 建档 → 云同步 → 离线经包 */
export default function IdentityShell({ children }: { children: React.ReactNode }) {
  const [usernameGuide, setUsernameGuide] = useState(false);

  useEffect(() => {
    void ensureAccountReady().then(() => {
      void syncNow().catch(() => {});
      void ensureOfflinePackAutoDownload();
      if (shouldPromptUsername()) setUsernameGuide(true);
    });
  }, []);

  return (
    <>
      {children}
      {usernameGuide ? <UsernameGuideSheet onDone={() => setUsernameGuide(false)} /> : null}
    </>
  );
}
