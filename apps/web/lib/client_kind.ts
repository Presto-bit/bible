/** 首次触达客户端类型（与服务端 analytics.client_kind 对齐） */

import { isStandalonePwa } from './platform';
import {
  detectInstallPlatform,
  isPeiaiAndroidCapabilityHost,
  isPeiaiAndroidChromeHost,
} from './pwa_platform';

export type ClientKind =
  | 'pwa'
  | 'android_shell'
  | 'android_flutter'
  | 'android_h5_tab'
  | 'browser'
  | 'inapp'
  | 'ios'
  | 'android'
  | 'unknown';

function sessionClientKind(): ClientKind | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const k = sessionStorage.getItem('peiai_client_kind');
    if (k === 'android_h5_tab' || k === 'android_flutter') return k;
  } catch {
    /* ignore */
  }
  return null;
}

/** 当前会话客户端 */
export function detectClientKind(): ClientKind {
  if (typeof window === 'undefined') return 'unknown';
  const fromSession = sessionClientKind();
  if (fromSession) return fromSession;
  if (
    typeof document !== 'undefined'
    && document.documentElement.classList.contains('android-flutter-h5')
  ) {
    return 'android_h5_tab';
  }
  // Flutter WebView UA 注入标记
  try {
    const ua = navigator.userAgent || '';
    if (/\bPeiaiFlutter\b/i.test(ua) && /\bandroid_h5_tab\b/i.test(ua)) {
      return 'android_h5_tab';
    }
    if (/\bPeiaiFlutter\b/i.test(ua)) {
      return 'android_flutter';
    }
  } catch {
    /* ignore */
  }
  if (isPeiaiAndroidCapabilityHost() || isPeiaiAndroidChromeHost()) return 'android_shell';
  if (isStandalonePwa()) return 'pwa';
  try {
    if (detectInstallPlatform() === 'inapp') return 'inapp';
  } catch {
    /* ignore */
  }
  return 'browser';
}

export function clientKindLabel(kind: string | null | undefined): string {
  switch ((kind || '').trim()) {
    case 'android_shell':
      return '安卓安装包（旧壳）';
    case 'android_flutter':
      return '安卓 Flutter';
    case 'android_h5_tab':
      return '安卓 Flutter·H5';
    case 'pwa':
      return 'PWA';
    case 'browser':
      return '浏览器';
    case 'inapp':
      return '内置浏览器';
    case 'ios':
      return 'iOS App';
    case 'android':
      return 'Android App';
    default:
      return kind?.trim() || '未知';
  }
}
