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
 * PWA 冷启动：仅控制 SSR 开屏节点计时淡出，不另挂一层，避免 hydration 双开屏跳动。
 */
export default function BrandSplash() {
  useEffect(() => {
    const node = document.getElementById(SSR_SPLASH_ID) as HTMLElement | null;

    if (!shouldShowBrandSplash()) {
      removeSplashNode(node);
      return;
    }

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
      // 先露出底层页（仍被固定开屏遮住），再淡出，避免去掉 pending 时底栏/layout 闪跳
      document.documentElement.classList.remove('peiai-splash-pending');
      node?.classList.add('is-fading');
      node?.setAttribute('aria-hidden', 'true');
      fadeTimer = setTimeout(finish, BRAND_SPLASH_FADE_MS);
    };

    const minTimer = setTimeout(beginFade, BRAND_SPLASH_MIN_MS);
    const maxTimer = setTimeout(beginFade, BRAND_SPLASH_MAX_MS);

    return () => {
      clearTimeout(minTimer);
      clearTimeout(maxTimer);
      if (fadeTimer) clearTimeout(fadeTimer);
    };
  }, []);

  return null;
}
