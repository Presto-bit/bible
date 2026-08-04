'use client';

import { useEffect } from 'react';
import { captureAndroidHostFromUrl } from '@/lib/android_host';
import { isLowEndDevice, isStandalonePwa } from '@/lib/platform';
import {
  isPeiaiAndroidCapabilityHost,
  isPeiaiAndroidChromeHost,
  isPeiaiAndroidWebViewShell,
} from '@/lib/pwa_platform';
import {
  initPwaContextMenuGuard,
  initPwaLinkPreviewGuard,
  initPwaNavGuard,
} from '@/lib/pwa_nav';
import { initIosTypingUndoGuard } from '@/lib/ios_typing_undo_guard';
import { initAndroidShellBridge } from '@/lib/android_shell_bridge';

/**
 * 为 PWA standalone / 安卓安装包挂 chrome 类。
 * 视觉 token 以 pwa-standalone 为准；android-shell / android-chrome-host 仅作标识。
 */
export default function PwaStandaloneShell() {
  useEffect(() => {
    captureAndroidHostFromUrl();

    const apply = () => {
      const standalone = isStandalonePwa();
      document.body.classList.toggle('pwa-standalone', standalone);
      document.documentElement.classList.toggle('pwa-standalone', standalone);
      const capabilityHost = isPeiaiAndroidCapabilityHost();
      document.documentElement.classList.toggle('android-shell', capabilityHost);
      document.body.classList.toggle('android-shell', capabilityHost);
      const chromeHost = isPeiaiAndroidChromeHost();
      document.documentElement.classList.toggle('android-chrome-host', chromeHost);
      document.body.classList.toggle('android-chrome-host', chromeHost);
      const legacyWebView = isPeiaiAndroidWebViewShell();
      document.documentElement.classList.toggle('android-webview-shell', legacyWebView);
      document.body.classList.toggle('android-webview-shell', legacyWebView);
      const perfLite = isLowEndDevice();
      document.documentElement.classList.toggle('perf-lite', perfLite);
      document.body.classList.toggle('perf-lite', perfLite);
    };
    apply();
    initPwaNavGuard();
    initPwaContextMenuGuard();
    initPwaLinkPreviewGuard();
    const stopUndoGuard = initIosTypingUndoGuard();
    const stopShellBridge = initAndroidShellBridge();
    const mq = window.matchMedia('(display-mode: standalone)');
    mq.addEventListener('change', apply);
    return () => {
      stopUndoGuard();
      stopShellBridge();
      mq.removeEventListener('change', apply);
    };
  }, []);
  return null;
}
