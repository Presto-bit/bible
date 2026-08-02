/** 微信 / QQ 等内置浏览器：引导到系统浏览器后再安装 */

import { BRAND_NAME } from './brand';
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
    return `已复制 · 现在点右上角 ··· →「${open}」`;
  }
  return `请点右上角 ··· →「${open}」`;
}

export function wechatInstallPrimaryLabel(): string {
  if (isAndroid()) return '没有「在浏览器打开」？复制链接';
  return '没有「在 Safari 打开」？复制链接';
}

export function wechatInstallSecondaryHint(): string {
  const open = openMenuLabel();
  return `微信里装不了。点右上角 ··· →「${open}」，打开后再继续`;
}

export function wechatMaskTitle(): string {
  return `先在${targetBrowserLabel()}打开`;
}

export function wechatMaskDesc(): string {
  const open = openMenuLabel();
  return `微信里无法安装。点右上角 ···，选「${open}」。打开后会继续引导你安装${BRAND_NAME}。`;
}
