'use client';

/**
 * 安卓安装包健康引导（可关、零 guilt）：
 * - Chrome Host 有新版本 → 半屏更新
 * - 旧 WebView 壳 → 引导覆盖安装 2.0+
 * - 浏览器主屏幕快捷方式 → 引导装官网包
 * - 已开提醒但未关电池优化 → 轻提示
 */

import { useEffect, useRef, useState } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';
import { BRAND_NAME } from '@/lib/brand';
import {
  androidPackageDownloadHref,
} from '@/lib/app_package_settings';
import {
  dismissAndroidShellHealth,
  isAndroidShellBatteryDismissed,
  probeAndroidShellHealth,
  type AndroidShellHealth,
} from '@/lib/android_shell_update';
import { markAndroidTwaInstallClaimed } from '@/lib/pwa_install_prompt';
import { getReminder } from '@/lib/reminder';
import { getGroupEveningReminder } from '@/lib/group_reminder';
import {
  isPeiaiAndroidCapabilityHost,
  isPeiaiAndroidChromeHost,
} from '@/lib/pwa_platform';
import { shouldDeferShellInterrupt } from '@/lib/im_session_gate';
import { useToast } from '@/components/ui/ToastProvider';

type SheetState = AndroidShellHealth | { kind: 'battery' } | null;

export default function AndroidShellHealthGuide() {
  const toast = useToast();
  const [sheet, setSheet] = useState<SheetState>(null);
  const [busy, setBusy] = useState(false);
  const probed = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || probed.current) return;
    probed.current = true;
    let cancelled = false;

    const run = async (attempt = 0) => {
      await new Promise((r) => window.setTimeout(r, attempt === 0 ? 1_600 : 2_400));
      if (cancelled) return;
      if (
        shouldDeferShellInterrupt()
        || document.querySelector('.sheet-backdrop')
      ) {
        if (attempt < 8) void run(attempt + 1);
        return;
      }

      const health = await probeAndroidShellHealth();
      if (cancelled) return;
      if (health) {
        setSheet(health);
        return;
      }

      if (!isPeiaiAndroidCapabilityHost() || isAndroidShellBatteryDismissed()) return;
      const dailyOn = getReminder().enabled;
      const groupOn = getGroupEveningReminder().enabled;
      if (!dailyOn && !groupOn) return;

      try {
        const { isAndroidShellBatteryExempt } = await import('@/lib/android_shell_bridge');
        if (isAndroidShellBatteryExempt()) return;
        if (cancelled || shouldDeferShellInterrupt()) {
          if (attempt < 8) void run(attempt + 1);
          return;
        }
        setSheet({ kind: 'battery' });
      } catch {
        /* ignore */
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sheet) return;
    const hideIfIm = () => {
      if (shouldDeferShellInterrupt()) setSheet(null);
    };
    hideIfIm();
    window.addEventListener('presto-tab-nav', hideIfIm);
    window.addEventListener('popstate', hideIfIm);
    return () => {
      window.removeEventListener('presto-tab-nav', hideIfIm);
      window.removeEventListener('popstate', hideIfIm);
    };
  }, [sheet]);

  const close = (kind: NonNullable<SheetState>['kind']) => {
    dismissAndroidShellHealth(kind);
    setSheet(null);
  };

  const downloadUpdate = async () => {
    if (!sheet || sheet.kind === 'battery') return;
    setBusy(true);
    try {
      if (isPeiaiAndroidCapabilityHost()) markAndroidTwaInstallClaimed();
      const href = androidPackageDownloadHref();
      toast(
        sheet.kind === 'legacy_standalone' || sheet.kind === 'legacy_webview'
          ? '开始下载安装包…装好后请打开桌面「彼爱」'
          : '正在下载更新包…',
      );
      dismissAndroidShellHealth(sheet.kind);

      if (isPeiaiAndroidChromeHost() && (sheet.kind === 'update' || sheet.kind === 'critical')) {
        const { installAndroidPackageViaHost } = await import('@/lib/android_shell_bridge');
        const absolute = new URL(href, window.location.origin).href;
        if (installAndroidPackageViaHost(absolute)) {
          setSheet(null);
          return;
        }
      }
      window.location.href = href;
    } finally {
      setBusy(false);
      setSheet(null);
    }
  };

  const openBattery = async () => {
    setBusy(true);
    try {
      const { openAndroidShellBatterySettings } = await import('@/lib/android_shell_bridge');
      openAndroidShellBatterySettings();
      dismissAndroidShellHealth('battery');
      toast('在系统页允许「无限制」后，提醒更准时');
    } finally {
      setBusy(false);
      setSheet(null);
    }
  };

  if (!sheet) return null;

  const title =
    sheet.kind === 'battery'
      ? '让读经提醒更准时'
      : sheet.kind === 'legacy_standalone'
        ? '建议安装彼爱 App'
        : sheet.kind === 'legacy_webview'
          ? '请更新彼爱安装包'
          : sheet.kind === 'critical'
            ? '请更新彼爱安装包'
            : '有新的安装包可用';

  const body =
    sheet.kind === 'battery'
      ? '部分手机省电会推迟本地提醒。允许彼爱不受电池限制后，关 App 也能准点轻响一声。'
      : sheet.kind === 'legacy_standalone'
        ? '当前像浏览器快捷方式。安装官网包后无地址栏、提醒更稳，读经记录仍在账号里。'
        : sheet.kind === 'legacy_webview'
          ? `当前 ${'localVersion' in sheet ? sheet.localVersion : ''} 为旧版内核。请下载官网新包装盖安装（不必卸载），体验将与 iOS 主屏幕一致，读经记录仍在。`
          : sheet.kind === 'critical'
            ? `当前 ${'localVersion' in sheet ? sheet.localVersion : ''} 偏旧。请下载官网包覆盖安装（不必卸载）。`
            : `当前 ${'localVersion' in sheet ? sheet.localVersion : ''}，可升到 ${'latestVersion' in sheet ? sheet.latestVersion : ''}。覆盖安装即可，读经记录仍在。`;

  const primary =
    sheet.kind === 'battery'
      ? '去系统设置'
      : sheet.kind === 'legacy_standalone' || sheet.kind === 'legacy_webview'
        ? '下载并安装'
        : '下载更新';

  return (
    <AppBodyPortal onTabAway={() => close(sheet.kind)}>
      <div
        className="sheet-backdrop"
        data-dismiss-on-tab-nav
        role="presentation"
        onClick={() => close(sheet.kind)}
      >
        <div
          className="sheet card"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="android-shell-health-title"
        >
          <p className="eyebrow">{BRAND_NAME}</p>
          <h2 id="android-shell-health-title" style={{ marginTop: 4 }}>
            {title}
          </h2>
          <p className="muted" style={{ lineHeight: 1.65 }}>
            {body}
          </p>
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={busy}
            onClick={() => {
              if (sheet.kind === 'battery') void openBattery();
              else void downloadUpdate();
            }}
          >
            {busy ? '请稍候…' : primary}
          </button>
          <button
            type="button"
            className="text-link"
            style={{ marginTop: 10 }}
            onClick={() => close(sheet.kind)}
          >
            稍后再说
          </button>
        </div>
      </div>
    </AppBodyPortal>
  );
}
