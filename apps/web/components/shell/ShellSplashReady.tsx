'use client';

import { useLayoutEffect } from 'react';
import { markBrandSplashShellReady } from '@/lib/brand_splash';

/** 壳层首帧可绘后通知开屏可淡出，避免拆掉时白屏 */
export default function ShellSplashReady() {
  useLayoutEffect(() => {
    markBrandSplashShellReady();
  }, []);
  return null;
}
