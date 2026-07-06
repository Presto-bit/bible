/** 全局捕获 Android beforeinstallprompt */

export interface DeferredInstallPrompt {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

let deferred: DeferredInstallPrompt | null = null;

export function initDeferredInstallPrompt() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as unknown as DeferredInstallPrompt;
  });
}

export function getDeferredInstallPrompt(): DeferredInstallPrompt | null {
  return deferred;
}

export function clearDeferredInstallPrompt() {
  deferred = null;
}
