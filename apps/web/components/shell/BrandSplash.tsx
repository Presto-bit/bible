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

function armSplashTimer(node: HTMLElement) {
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

  const minTimer = setTimeout(beginFade, BRAND_SPLASH_MIN_MS);
  const maxTimer = setTimeout(beginFade, BRAND_SPLASH_MAX_MS);

  return () => {
    clearTimeout(minTimer);
    clearTimeout(maxTimer);
    if (fadeTimer) clearTimeout(fadeTimer);
  };
}

/**
 * PWA 冷启动开屏：body 内联脚本在 HTML 解析时即启动 2s 计时；
 * 此处仅作 hydration 兜底，且绝不在内联已接管时提前拆除。
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
    node.setAttribute('aria-hidden', 'false');
    return armSplashTimer(node);
  }, []);

  return null;
}
