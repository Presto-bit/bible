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

/**
 * 为 PWA standalone / 安卓壳挂 chrome 类。
 * 壳 UA 在 isStandalonePwa 中恒为 true，与原生 document-start 的 pwa-standalone 一致；
 * 视觉 token 以 pwa-standalone 为准，android-shell 仅作标识（bridge / 诊断）。
 */
export default function PwaStandaloneShell() {
  useEffect(() => {
    const apply = () => {
      const standalone = isStandalonePwa();
      document.body.classList.toggle('pwa-standalone', standalone);
      document.documentElement.classList.toggle('pwa-standalone', standalone);
      // 标识类：CSS 不再用它做底栏/字重/min-height 分叉
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
