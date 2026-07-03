'use client';

import { useEffect } from 'react';
import { isStandalonePwa } from '@/lib/platform';

/** 为 PWA standalone 模式添加 body 类，启用质感专项样式。 */
export default function PwaStandaloneShell() {
  useEffect(() => {
    const apply = () => {
      document.body.classList.toggle('pwa-standalone', isStandalonePwa());
    };
    apply();
    window.matchMedia('(display-mode: standalone)').addEventListener('change', apply);
    return () => {
      window.matchMedia('(display-mode: standalone)').removeEventListener('change', apply);
    };
  }, []);
  return null;
}
