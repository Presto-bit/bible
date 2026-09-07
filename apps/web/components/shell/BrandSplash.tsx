'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
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

function clearSplashChrome() {
  document.documentElement.classList.remove('peiai-splash-pending', 'peiai-splash-lock');
  document.getElementById('peiai-brand-splash-ssr')?.remove();
}

/**
 * PWA 冷启动：SSR 占位 → 客户端固定层接管（首版方案，可见 1.5s）。
 * useLayoutEffect 在首帧绘制前交接，避免仅 SSR 被提前拆掉导致闪退。
 */
export default function BrandSplash() {
  const [active, setActive] = useState(false);
  const [fading, setFading] = useState(false);

  useLayoutEffect(() => {
    if (!shouldShowBrandSplash()) {
      clearSplashChrome();
      return;
    }

    setActive(true);
    document.getElementById('peiai-brand-splash-ssr')?.remove();
  }, []);

  useEffect(() => {
    if (!active) return;

    let fadeTimer: ReturnType<typeof setTimeout> | null = null;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      markBrandSplashDone();
      clearSplashChrome();
      setActive(false);
      setFading(false);
    };

    const beginFade = () => {
      if (fadeTimer || finished) return;
      document.documentElement.classList.remove('peiai-splash-pending');
      setFading(true);
      fadeTimer = setTimeout(finish, BRAND_SPLASH_FADE_MS);
    };

    const minTimer = setTimeout(beginFade, BRAND_SPLASH_MIN_MS);
    const maxTimer = setTimeout(beginFade, BRAND_SPLASH_MAX_MS);

    return () => {
      clearTimeout(minTimer);
      clearTimeout(maxTimer);
      if (fadeTimer) clearTimeout(fadeTimer);
    };
  }, [active]);

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
