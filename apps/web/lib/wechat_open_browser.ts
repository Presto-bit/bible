/** 微信 / QQ 等内置浏览器：只引导到系统浏览器，安装在落地页再说 */

import { isAndroid, isIOS } from './pwa_platform';
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

function targetBrowserLabel(): string {
  if (isIOS()) return 'Safari';
  if (isAndroid()) return '浏览器';
  return '浏览器';
}

function openMenuLabel(): string {
  if (isIOS()) return '在 Safari 打开';
  return '在浏览器打开';
}

/** 复制成功/失败后的 Toast：只催逃逸，不讲安装细节 */
export function wechatOpenBrowserToast(copied: boolean): string {
  const open = openMenuLabel();
  if (copied) {
    return `已复制 · 点右上角 ··· →「${open}」`;
  }
  return `请点右上角 ··· →「${open}」；也可再点复制链接`;
}

export function wechatInstallPrimaryLabel(): string {
  if (isAndroid()) return '复制链接，在浏览器打开';
  return '复制链接，在 Safari 打开';
}

export function wechatInstallSecondaryHint(): string {
  const open = openMenuLabel();
  return `点右上角 ··· →「${open}」。打开后就是当前这篇。`;
}

export function wechatMaskTitle(): string {
  return `先在${targetBrowserLabel()}打开`;
}

export function wechatMaskDesc(): string {
  const open = openMenuLabel();
  return `点右上角 ···，选「${open}」。`;
}
