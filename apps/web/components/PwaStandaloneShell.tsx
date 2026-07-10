'use client';

import { useEffect } from 'react';
import { isStandalonePwa } from '@/lib/platform';
import { initPwaContextMenuGuard, initPwaNavGuard } from '@/lib/pwa_nav';

/** 为 PWA standalone 模式添加 body 类，启用质感专项样式。 */
export default function PwaStandaloneShell() {
  useEffect(() => {
    const apply = () => {
      const standalone = isStandalonePwa();
      document.body.classList.toggle('pwa-standalone', standalone);
      document.documentElement.classList.toggle('pwa-standalone', standalone);
    };
    apply();
    initPwaNavGuard();
    initPwaContextMenuGuard();
    window.matchMedia('(display-mode: standalone)').addEventListener('change', apply);
    return () => {
      window.matchMedia('(display-mode: standalone)').removeEventListener('change', apply);
    };
  }, []);
  return null;
}
