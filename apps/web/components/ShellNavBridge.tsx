'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { initShellNavBridge } from '@/lib/shell_nav';
import { isPeiaiFlutterH5Host } from '@/lib/android_host';
import { isPeiaiAndroidShell } from '@/lib/pwa_platform';

/** 安卓壳 / Flutter 嵌 H5：深链与系统返回走 SPA，不整页 loadUrl */
export default function ShellNavBridge() {
  const router = useRouter();

  useEffect(() => {
    if (!isPeiaiAndroidShell() && !isPeiaiFlutterH5Host()) return;
    return initShellNavBridge(router);
  }, [router]);

  return null;
}
