/** 微信内置浏览器：无法装 PWA，引导复制链接并用系统浏览器打开 */

import { BRAND_NAME } from './brand';
import { isIOS } from './pwa_platform';
import { toCanonicalShareUrl } from './share_site';
import {
  markWechatEscapeIntent,
  notePostInstallPath,
  withFromWechatParam,
} from './wechat_escape';

export async function copyCurrentPageUrl(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  notePostInstallPath();
  markWechatEscapeIntent();
  const canonical = toCanonicalShareUrl(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
  const url = withFromWechatParam(canonical);
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export function wechatOpenBrowserToast(copied: boolean): string {
  const browser = isIOS() ? 'Safari' : '浏览器';
  if (copied) {
    return `链接已复制 · 点右上角 ··· → 在${browser}打开`;
  }
  return `请点右上角 ··· →「在${browser}打开」，再添加到主屏幕`;
}

export function wechatInstallPrimaryLabel(): string {
  return '复制链接，用浏览器打开';
}

export function wechatInstallSecondaryHint(): string {
  const browser = isIOS() ? 'Safari' : 'Chrome / 系统浏览器';
  return `微信里无法安装；用 ${browser} 打开后，即可把${BRAND_NAME}保存到主屏幕`;
}
