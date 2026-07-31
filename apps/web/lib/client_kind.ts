/** 首次触达客户端类型（与服务端 analytics.client_kind 对齐） */

import { isStandalonePwa } from './platform';
import { detectInstallPlatform } from './pwa_platform';

export type ClientKind = 'pwa' | 'browser' | 'inapp' | 'ios' | 'android' | 'unknown';

/** 当前会话客户端：PWA 优先；微信等内置浏览器；其余记为浏览器 */
export function detectClientKind(): ClientKind {
  if (typeof window === 'undefined') return 'unknown';
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
