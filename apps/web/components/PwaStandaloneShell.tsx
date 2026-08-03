'use client';

import { useEffect } from 'react';
import { isLowEndDevice, isStandalonePwa } from '@/lib/platform';
import { isPeiaiAndroidShell } from '@/lib/pwa_platform';
import {
  initPwaContextMenuGuard,
  initPwaLinkPreviewGuard,
  initPwaNavGuard,
} from '@/lib/pwa_nav';
import { initIosTypingUndoGuard } from '@/lib/ios_typing_undo_guard';
import { initAndroidShellBridge } from '@/lib/android_shell_bridge';

/** 为 PWA standalone / 安卓壳添加类与安全区回退，启用质感专项样式。 */
export default function PwaStandaloneShell() {
  useEffect(() => {
    const apply = () => {
      const standalone = isStandalonePwa();
      document.body.classList.toggle('pwa-standalone', standalone);
      document.documentElement.classList.toggle('pwa-standalone', standalone);
      const androidShell = isPeiaiAndroidShell();
      document.documentElement.classList.toggle('android-shell', androidShell);
      document.body.classList.toggle('android-shell', androidShell);
      const perfLite = isLowEndDevice();
      document.documentElement.classList.toggle('perf-lite', perfLite);
      document.body.classList.toggle('perf-lite', perfLite);
    };
    apply();
    initPwaNavGuard();
    initPwaContextMenuGuard();
    initPwaLinkPreviewGuard();
    const stopUndoGuard = initIosTypingUndoGuard();
    const stopShellBridge = initAndroidShellBridge();
    const mq = window.matchMedia('(display-mode: standalone)');
    mq.addEventListener('change', apply);
    return () => {
      stopUndoGuard();
      stopShellBridge();
      mq.removeEventListener('change', apply);
    };
  }, []);
  return null;
}
