'use client';

import { useEffect } from 'react';

const MIN_SPLASH_MS = 1500;

/** PWA 启动屏：独立模式首屏展示品牌，hydrate 后淡出。 */
export default function PwaSplash() {
  useEffect(() => {
    const splash = document.getElementById('pwa-splash');
    if (!splash) return;

    if (!document.documentElement.classList.contains('pwa-launch')) {
      splash.remove();
      return;
    }

    const started = performance.now();
    const dismiss = () => {
      const elapsed = performance.now() - started;
      const wait = Math.max(0, MIN_SPLASH_MS - elapsed);
      window.setTimeout(() => {
        document.body.classList.add('app-ready');
        splash.addEventListener(
          'transitionend',
          () => splash.remove(),
          { once: true },
        );
        window.setTimeout(() => splash.remove(), 500);
      }, wait);
    };

    if (document.readyState === 'complete') dismiss();
    else window.addEventListener('load', dismiss, { once: true });

    return () => window.removeEventListener('load', dismiss);
  }, []);

  return null;
}
