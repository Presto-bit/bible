'use client';

import { useEffect } from 'react';
import {
  BRAND_SPLASH_FADE_MS,
  BRAND_SPLASH_MAX_MS,
  BRAND_SPLASH_MIN_MS,
  markBrandSplashDone,
  shouldShowBrandSplash,
} from '@/lib/brand_splash';

const SSR_SPLASH_ID = 'peiai-brand-splash-ssr';

function removeSplashNode(node: HTMLElement | null) {
  document.documentElement.classList.remove('peiai-splash-pending', 'peiai-splash-lock');
  node?.remove();
}

/**
 * PWA 冷启动：仅控制 SSR 开屏节点计时淡出，不另挂客户端层，避免双开屏交接跳动。
 * pending 与壳层露出同帧在 finish 解除，fade 期间仍遮罩首页。
 */
export default function BrandSplash() {
  useEffect(() => {
    const node = document.getElementById(SSR_SPLASH_ID) as HTMLElement | null;

    if (!shouldShowBrandSplash()) {
      removeSplashNode(node);
      return;
    }

    if (!node) return;

    let fadeTimer: ReturnType<typeof setTimeout> | null = null;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      markBrandSplashDone();
      removeSplashNode(node);
    };

    const beginFade = () => {
      if (fadeTimer || finished) return;
      node.classList.add('is-fading');
      node.setAttribute('aria-hidden', 'true');
      fadeTimer = setTimeout(finish, BRAND_SPLASH_FADE_MS);
    };

    const start = window.__PEIAI_SPLASH_START__ ?? Date.now();
    const elapsed = Date.now() - start;
    const waitMin = Math.max(0, BRAND_SPLASH_MIN_MS - elapsed);
    const waitMax = Math.max(0, BRAND_SPLASH_MAX_MS - elapsed);

    const minTimer = setTimeout(beginFade, waitMin);
    const maxTimer = setTimeout(beginFade, waitMax);

    return () => {
      clearTimeout(minTimer);
      clearTimeout(maxTimer);
      if (fadeTimer) clearTimeout(fadeTimer);
    };
  }, []);

  return null;
}
