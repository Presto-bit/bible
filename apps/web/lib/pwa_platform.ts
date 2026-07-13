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

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
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
      return [
        { title: '点底部分享', detail: 'Safari 底部中间的 ↑ 分享按钮' },
        { title: '添加到主屏幕', detail: '在菜单中找到「添加到主屏幕」' },
        { title: '确认名称「彼爱」', detail: '主屏幕将显示与 iOS 一致的图标与名称' },
      ];
    case 'ios-other':
      return [
        { title: '用 Safari 打开', detail: '复制链接，在 Safari 中打开更稳定' },
        { title: '分享 → 添加到主屏幕', detail: '与 Safari 安装步骤相同' },
      ];
    case 'android-chrome':
      return [
        { title: '点「添加」或菜单', detail: '本页可能弹出「添加到主屏幕」' },
        { title: '确认安装', detail: '图标与 iOS 同源，不会另做 Android 风格' },
        { title: '从主屏幕打开', detail: '全屏竖屏，与 iOS 同款体验' },
      ];
    case 'android-other':
      return [
        { title: '打开浏览器菜单 ⋮', detail: '小米 / 华为 / OPPO 等通常在右上角' },
        { title: '添加到主屏幕 / 桌面', detail: '文案因浏览器而异' },
        { title: '确认名称「彼爱」', detail: '图标与 iPhone 主屏幕一致' },
      ];
    case 'inapp':
      return [
        { title: '用系统浏览器打开', detail: '微信内无法安装，请点右上角 …' },
        { title: '在 Safari / Chrome 中打开', detail: '再按对应平台的安装步骤操作' },
      ];
    case 'desktop':
      return [
        { title: '设置账号密码', detail: '在「我的」设置用户名与密码，读经记录才会保存在账号里' },
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
      return '请先用 Safari 或 Chrome 打开';
    case 'ios-safari':
      return '添加到主屏幕，像 App 一样打开';
    case 'ios-other':
      return '建议在 Safari 中安装';
    case 'android-chrome':
      return '添加到主屏幕，离线也能打开';
    case 'android-other':
      return '从浏览器菜单添加到主屏幕';
    case 'desktop':
      return '把读经记录保存到桌面 App，重装后也能找回';
    default:
      return '已安装到主屏幕';
  }
}
