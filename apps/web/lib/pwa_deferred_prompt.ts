/** 全局捕获 beforeinstallprompt（仅桌面保存用；安卓抑制 PWA 安装条，主推 APK） */

import { isAndroid } from '@/lib/pwa_platform';

export interface DeferredInstallPrompt {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

let deferred: DeferredInstallPrompt | null = null;

export function initDeferredInstallPrompt() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    // 一律拦截浏览器默认安装条，避免安卓出现「添加到主屏幕」与 APK 双路径
    e.preventDefault();
    if (isAndroid()) {
      return;
    }
    deferred = e as unknown as DeferredInstallPrompt;
  });
}

export function getDeferredInstallPrompt(): DeferredInstallPrompt | null {
  return deferred;
}

export function clearDeferredInstallPrompt() {
  deferred = null;
}
