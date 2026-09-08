'use client';

import { useEffect } from 'react';
import { armBrandSplashNode } from '@/lib/brand_splash_arm';
import { shouldShowBrandSplash } from '@/lib/brand_splash';

const SSR_SPLASH_ID = 'peiai-brand-splash-ssr';

function removeSplashNode(node: HTMLElement | null) {
  document.documentElement.classList.remove('peiai-splash-pending', 'peiai-splash-lock');
  node?.remove();
}

/**
 * PWA 冷启动：body 内联脚本在 HTML 解析时接管；此处仅 hydration 兜底。
 */
export default function BrandSplash() {
  useEffect(() => {
    const node = document.getElementById(SSR_SPLASH_ID) as HTMLElement | null;

    if (window.__PEIAI_SPLASH_ARMED__) return;

    if (!shouldShowBrandSplash()) {
      removeSplashNode(node);
      return;
    }

    if (!node) return;

    window.__PEIAI_SPLASH_ARMED__ = true;
    return armBrandSplashNode(node);
  }, []);

  return null;
}
