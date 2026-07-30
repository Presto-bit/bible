/** 微信内置浏览器：无法装 PWA，引导复制链接并用系统浏览器打开 */

import { BRAND_NAME } from './brand';

export async function copyCurrentPageUrl(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const url = window.location.href;
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
  if (copied) {
    return '链接已复制 · 点右上角 ··· → 在浏览器打开';
  }
  return `请点右上角 ··· →「在浏览器打开」，再添加到主屏幕`;
}

export function wechatInstallPrimaryLabel(): string {
  return '复制链接，用浏览器打开';
}

export function wechatInstallSecondaryHint(): string {
  return `微信里打不开安装；用 Safari / Chrome 打开后，即可把${BRAND_NAME}保存到主屏幕`;
}
