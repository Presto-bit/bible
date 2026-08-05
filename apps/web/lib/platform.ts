/** 低端/省流判定与 Tab 保活策略 */

import { isAndroid, isPeiaiAndroidCapabilityHost } from '@/lib/pwa_platform';

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  if (isPeiaiAndroidCapabilityHost()) return true;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || window.matchMedia('(display-mode: minimal-ui)').matches
    || nav.standalone === true
  );
}

type NavHints = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
};

/**
 * 低端/省流机：少特效、降毛玻璃。
 * 安卓安装包 WebView 若误判为「低端」会砍掉过多 UI，改为更宽松。
 */
export function isLowEndDevice(): boolean {
  if (typeof window === 'undefined') return false;
  // 已安装包：更宽松，避免误砍 UI（Chrome Host 与旧壳同策略）
  if (isPeiaiAndroidCapabilityHost()) {
    const nav = navigator as NavHints;
    if (nav.connection?.saveData) return true;
    if (typeof nav.deviceMemory === 'number' && nav.deviceMemory > 0 && nav.deviceMemory <= 2) {
      return true;
    }
    if (
      typeof nav.hardwareConcurrency === 'number'
      && nav.hardwareConcurrency > 0
      && nav.hardwareConcurrency <= 2
    ) {
      return true;
    }
    return false;
  }
  const nav = navigator as NavHints;
  if (nav.connection?.saveData) return true;
  const et = nav.connection?.effectiveType;
  if (et === 'slow-2g' || et === '2g') return true;
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory > 0 && nav.deviceMemory <= 4) {
    return true;
  }
  if (
    typeof nav.hardwareConcurrency === 'number'
    && nav.hardwareConcurrency > 0
    && nav.hardwareConcurrency <= 4
  ) {
    return true;
  }
  return false;
}

/**
 * 仅在真正受限设备上关闭五 Tab 保活（≤2GB 或 ≤2 核 / 省流 / 2g）。
 * 安卓安装包壳强制开启保活：反复卸载阅读器会卡顿且 portal 弹层更易丢状态。
 */
export function isTabKeepAliveEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (isPeiaiAndroidCapabilityHost()) return true;
  const nav = navigator as NavHints;
  if (nav.connection?.saveData) return false;
  const et = nav.connection?.effectiveType;
  if (et === 'slow-2g' || et === '2g') return false;
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory > 0 && nav.deviceMemory <= 2) {
    return false;
  }
  if (
    typeof nav.hardwareConcurrency === 'number'
    && nav.hardwareConcurrency > 0
    && nav.hardwareConcurrency <= 2
  ) {
    return false;
  }
  return true;
}

export function isFinePointerDesktop(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

export function platformAccountHint(): string {
  if (isStandalonePwa()) {
    if (isPeiaiAndroidCapabilityHost() || isAndroid()) {
      return '已安装彼爱 App：请用手机号或用户 ID + 密码登录并等待同步完成。重装前务必已设密码；卸载重装后需重新登录才能拉回进度与成就。';
    }
    return '已保存到主屏幕：请用手机号或用户 ID + 密码登录并等待同步完成。重装前务必已设密码；删掉重装后需重新登录才能拉回进度与成就。';
  }
  if (isFinePointerDesktop()) {
    return '电脑浏览器：建议设置密码后再保存到桌面。未设密时数据仅本机，重装后可能丢失。';
  }
  if (isAndroid()) {
    return '安卓请下载安装彼爱 App（官方 Flutter 安装包）；设置密码后换机可用手机号或用户 ID + 密码登录同步。不推荐用「添加到主屏幕」，也不依赖安装 Chrome。';
  }
  return '浏览器临时访问：建议设置密码并添加到主屏幕；换机请用手机号或用户 ID + 密码登录后等待同步完成。';
}
