/** 尽早拦截安卓 beforeinstallprompt，避免浏览器自带「添加主屏幕」条；仅桌面保留 */

import { isAndroid } from '@/lib/pwa_platform';

export interface DeferredInstallPrompt {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

let deferred: DeferredInstallPrompt | null = null;
let bound = false;

export function initDeferredInstallPrompt() {
  if (typeof window === 'undefined' || bound) return;
  bound = true;

  // capture 阶段尽早 preventDefault：安卓不走 PWA 安装，只推 APK
  window.addEventListener(
    'beforeinstallprompt',
    (e) => {
      e.preventDefault();
      if (isAndroid()) {
        deferred = null;
        return;
      }
      deferred = e as unknown as DeferredInstallPrompt;
    },
    true,
  );

  // 安卓额外：部分内核仍可能冒「添加到主屏幕」菜单；无法拦 OS 菜单，主路径靠我们的 APK Sheet
  if (isAndroid()) {
    try {
      // 抑制部分 Chromium 相关安装能力（无法保证所有厂商浏览器）
      (window as Window & { onbeforeinstallprompt?: null }).onbeforeinstallprompt = null;
    } catch {
      /* ignore */
    }
  }
}

export function getDeferredInstallPrompt(): DeferredInstallPrompt | null {
  return deferred;
}

export function clearDeferredInstallPrompt() {
  deferred = null;
}
