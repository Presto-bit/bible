'use client';

import { useEffect, useState } from 'react';
import { BASE_PATH } from '@/lib/basePath';
import {
  BRAND_SPLASH_FADE_MS,
  BRAND_SPLASH_MAX_MS,
  BRAND_SPLASH_MIN_MS,
  BRAND_SPLASH_SUBTITLE,
  BRAND_SPLASH_TITLE,
  markBrandSplashDone,
  shouldShowBrandSplash,
} from '@/lib/brand_splash';

function removeSsrSplashNode() {
  document.documentElement.classList.remove('peiai-splash-pending');
  document.getElementById('peiai-brand-splash-ssr')?.remove();
}

/**
 * PWA 冷启动品牌层：约 1.5s 后淡出，露出当前路由（首页或深链页）。
 */
export default function BrandSplash() {
  const [active, setActive] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!shouldShowBrandSplash()) {
      removeSsrSplashNode();
      return;
    }
    setActive(true);

    const started = Date.now();
    let fadeTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      markBrandSplashDone();
      removeSsrSplashNode();
      setActive(false);
      setFading(false);
    };

    const beginFade = () => {
      if (fadeTimer) return;
      setFading(true);
      fadeTimer = setTimeout(finish, BRAND_SPLASH_FADE_MS);
    };

    const minTimer = setTimeout(beginFade, BRAND_SPLASH_MIN_MS);
    const maxTimer = setTimeout(beginFade, BRAND_SPLASH_MAX_MS);

    return () => {
      clearTimeout(minTimer);
      clearTimeout(maxTimer);
      if (fadeTimer) clearTimeout(fadeTimer);
      void started;
    };
  }, []);

  if (!active) return null;

  const iconSrc = `${BASE_PATH || ''}/apple-touch-icon.png`;

  return (
    <div
      className={`peiai-brand-splash${fading ? ' is-fading' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="彼爱"
      aria-busy={!fading}
    >
      <div className="peiai-brand-splash-inner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="peiai-brand-splash-icon"
          src={iconSrc}
          alt=""
          width={120}
          height={120}
          decoding="sync"
        />
        <p className="peiai-brand-splash-title">{BRAND_SPLASH_TITLE}</p>
        <p className="peiai-brand-splash-sub">{BRAND_SPLASH_SUBTITLE}</p>
      </div>
    </div>
  );
}
