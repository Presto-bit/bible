'use client';

import { useEffect } from 'react';
import { isLowEndDevice, isStandalonePwa } from '@/lib/platform';
import {
  initPwaContextMenuGuard,
  initPwaLinkPreviewGuard,
  initPwaNavGuard,
} from '@/lib/pwa_nav';
import { initIosTypingUndoGuard } from '@/lib/ios_typing_undo_guard';

/** 为 PWA standalone 模式添加 body 类，启用质感专项样式。 */
export default function PwaStandaloneShell() {
  useEffect(() => {
    const apply = () => {
      const standalone = isStandalonePwa();
      document.body.classList.toggle('pwa-standalone', standalone);
      document.documentElement.classList.toggle('pwa-standalone', standalone);
      const perfLite = isLowEndDevice();
      document.documentElement.classList.toggle('perf-lite', perfLite);
      document.body.classList.toggle('perf-lite', perfLite);
    };
    apply();
    initPwaNavGuard();
    initPwaContextMenuGuard();
    initPwaLinkPreviewGuard();
    const stopUndoGuard = initIosTypingUndoGuard();
    window.matchMedia('(display-mode: standalone)').addEventListener('change', apply);
    return () => {
      stopUndoGuard();
      window.matchMedia('(display-mode: standalone)').removeEventListener('change', apply);
    };
  }, []);
  return null;
}
