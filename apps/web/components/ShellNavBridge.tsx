'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { initShellNavBridge } from '@/lib/shell_nav';
import { isPeiaiAndroidShell } from '@/lib/pwa_platform';

/** 安卓壳：深链与系统返回走 SPA（KeepAlive / router），不整页 loadUrl */
export default function ShellNavBridge() {
  const router = useRouter();

  useEffect(() => {
    if (!isPeiaiAndroidShell()) return;
    return initShellNavBridge(router);
  }, [router]);

  return null;
}
