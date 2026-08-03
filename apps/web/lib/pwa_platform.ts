/** PWA 安装环境检测 */

export type InstallPlatform =
  | 'ios-safari'
  | 'ios-other'
  | 'android-chrome'
  | 'android-other'
  | 'inapp'
  | 'desktop'
  | 'standalone';

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

export function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /MicroMessenger|QQ\//i.test(navigator.userAgent);
}

export function isPeiaiAndroidShell(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /PeiaiAndroidShell\//i.test(navigator.userAgent);
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (isPeiaiAndroidShell()) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  // TWA / 主屏幕：standalone；部分环境会报 fullscreen / minimal-ui
  return (
    window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || window.matchMedia('(display-mode: minimal-ui)').matches
    || nav.standalone === true
  );
}

export function isSafariIOS(): boolean {
  if (!isIOS()) return false;
  const ua = navigator.userAgent;
  return /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|mercury|MicroMessenger|QQ\//i.test(ua);
}

export function isAndroidChrome(): boolean {
  if (!isAndroid()) return false;
  return /Chrome/i.test(navigator.userAgent) && !/MicroMessenger|QQ\//i.test(navigator.userAgent);
}

export function detectInstallPlatform(): InstallPlatform {
  if (isStandalone()) return 'standalone';
  if (isInAppBrowser()) return 'inapp';
  if (isIOS()) return isSafariIOS() ? 'ios-safari' : 'ios-other';
  if (isAndroid()) return isAndroidChrome() ? 'android-chrome' : 'android-other';
  if (typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches && window.innerWidth > 768) {
    return 'desktop';
  }
  return 'android-other';
}

export interface InstallStep {
  title: string;
  detail: string;
}

export function installSteps(platform: InstallPlatform): InstallStep[] {
  switch (platform) {
    case 'ios-safari':
      // UI 主路径为 IosSafariInstallCoach；此处供分享页等纯文案兜底
      return [
        {
          title: '点底栏「共享」↑',
          detail: 'Safari 底栏中间，不是发给朋友',
        },
        {
          title: '添加到主屏幕 → 添加',
          detail: '菜单里向下滑找到，确认名称「彼爱」即可',
        },
      ];
    case 'ios-other':
      return [
        { title: '建议用 Safari 打开', detail: '复制链接，粘贴到 Safari 更稳；也可继续用当前浏览器' },
        {
          title: '点工具栏「共享」',
          detail: 'Chrome / Edge 等也是 ↑「共享」或「⋯」里的共享，再选「添加到主屏幕」',
        },
      ];
    case 'android-chrome':
      return [
        { title: '点「下载并安装」', detail: '直接下载彼爱安装包，不跳应用商店' },
        {
          title: '允许安装',
          detail: '若系统提示「未知来源 / 允许从此来源安装」，请允许后继续',
        },
        {
          title: '打开桌面「彼爱」',
          detail: '安装完成后请点桌面图标进入（App 内置，不是浏览器书签）',
        },
      ];
    case 'android-other':
      return [
        { title: '点「下载并安装」', detail: '直接下载彼爱安装包，不跳应用商店' },
        {
          title: '允许安装',
          detail: '小米 / 华为 / OPPO 等可能提示「未知应用」，按提示允许即可',
        },
        {
          title: '打开桌面「彼爱」',
          detail: '安装完成后请点桌面图标进入（App 内置，不是浏览器书签）',
        },
      ];
    case 'inapp':
      // 只催逃逸；安装细节等出微信后再讲
      if (typeof navigator !== 'undefined' && isIOS()) {
        return [
          {
            title: '点右上角 ···',
            detail: '选「在 Safari 打开」或「在默认浏览器中打开」',
          },
          {
            title: '用 Safari 打开本页',
            detail: '打开后会再教你保存到主屏幕',
          },
        ];
      }
      return [
        {
          title: '点右上角 ···',
          detail: '选「在浏览器打开」或「用默认浏览器打开」',
        },
        {
          title: '用系统浏览器打开本页',
          detail: '打开后即可下载安装彼爱',
        },
      ];
    case 'desktop':
      return [
        { title: '设置密码', detail: '在「我的 → 账号与安全」设置密码（建议绑定手机），读经记录才会保存在账号里' },
        { title: '保存到桌面 App', detail: 'Chrome / Edge 地址栏右侧 ⊕，或菜单「安装彼爱…」' },
        { title: '重装勿清数据', detail: '卸载时不要勾选「清除网站数据」；之后用同一账号登录即可找回' },
      ];
    default:
      return [];
  }
}

export function installHeadline(platform: InstallPlatform): string {
  switch (platform) {
    case 'inapp':
      return isIOS()
        ? '先在 Safari 打开'
        : '先在浏览器打开';
    case 'ios-safari':
      return '保存到主屏幕，像打开 App 一样读经';
    case 'ios-other':
      return '建议在 Safari 中保存到主屏幕';
    case 'android-chrome':
      return '安装彼爱 App（下载安装包），像独立 App 一样用';
    case 'android-other':
      return '安装彼爱 App：直接下载安装包，不跳应用商店';
    case 'desktop':
      return '把读经记录保存到桌面 App，重装后也能找回';
    default:
      return '已安装到主屏幕';
  }
}
