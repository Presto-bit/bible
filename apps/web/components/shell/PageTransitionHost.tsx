'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { prefersReducedMotion } from '@/lib/peiai_motion';

/**
 * 二级路由 pathname 变化时：为 main 打 page-enter-soft（无 View Transition 时的降级）。
 * View Transition 由 navigateAppHref → runWithViewTransition 负责。
 */
export default function PageTransitionHost() {
  const pathname = usePathname();
  const prev = useRef(pathname);

  useEffect(() => {
    if (prev.current === pathname) return;
    prev.current = pathname;
    if (prefersReducedMotion()) return;
    const main = document.querySelector('main');
    if (!main) return;
    main.classList.remove('page-enter-soft');
    void (main as HTMLElement).offsetWidth;
    main.classList.add('page-enter-soft');
    const t = window.setTimeout(() => main.classList.remove('page-enter-soft'), 360);
    return () => {
      window.clearTimeout(t);
      main.classList.remove('page-enter-soft');
    };
  }, [pathname]);

  return null;
}
