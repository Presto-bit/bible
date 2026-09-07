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
  document.documentElement.classList.remove(
    'peiai-splash-pending',
    'peiai-splash-lock',
    'peiai-splash-active',
  );
  node?.remove();
}

function scheduleDismiss(node: HTMLElement) {
  if (window.__PEIAI_SPLASH_DISMISS__ === true) return;
  window.__PEIAI_SPLASH_DISMISS__ = true;

  let fadeTimer: ReturnType<typeof setTimeout> | null = null;
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    markBrandSplashDone();
    removeSplashNode(node);
  };

  const beginFade = () => {
    if (fadeTimer || finished || !document.getElementById(SSR_SPLASH_ID)) return;
    document.documentElement.classList.remove('peiai-splash-pending');
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
}

/**
 * PWA 冷启动：内联脚本负责首屏计时；此处仅兜底并避免 hydration 误删开屏。
 */
export default function BrandSplash() {
  useEffect(() => {
    const node = document.getElementById(SSR_SPLASH_ID) as HTMLElement | null;
    const root = document.documentElement;

    if (window.__PEIAI_SPLASH_DONE__ || !node) {
      removeSplashNode(node);
      return;
    }

    if (!root.classList.contains('peiai-splash-active')) {
      if (!shouldShowBrandSplash()) {
        removeSplashNode(node);
      }
      return;
    }

    if (window.__PEIAI_SPLASH_DISMISS__) return;

    return scheduleDismiss(node) ?? undefined;
  }, []);

  return null;
}
