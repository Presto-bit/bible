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
  if (isAndroid()) return 'Chrome / 系统浏览器';
  return '浏览器';
}

/** 复制成功/失败后的 Toast：按 iOS=PWA / 安卓=TWA 区分 */
export function wechatOpenBrowserToast(copied: boolean): string {
  const browser = targetBrowserLabel();
  if (isAndroid()) {
    if (copied) {
      return `链接已复制 · 点右上角 ··· → 在${browser}打开 → 下载安装`;
    }
    return `请点右上角 ··· →「在浏览器打开」，再下载安装${BRAND_NAME}`;
  }
  if (copied) {
    return `链接已复制 · 点右上角 ··· → 在${browser}打开`;
  }
  return `请点右上角 ··· →「在${browser}打开」，再添加到主屏幕`;
}

export function wechatInstallPrimaryLabel(): string {
  if (isAndroid()) return '复制链接，用浏览器打开后安装';
  return '复制链接，用 Safari 打开';
}

export function wechatInstallSecondaryHint(): string {
  if (isAndroid()) {
    return `微信里无法直接安装。用系统浏览器打开后，点「下载并安装」即可装上${BRAND_NAME}（不跳应用商店）`;
  }
  return `微信里无法添加到主屏幕。用 Safari 打开后，即可把${BRAND_NAME}保存到主屏幕`;
}

export function wechatMaskTitle(): string {
  if (isAndroid()) return '在浏览器打开，才能安装 App';
  return '在 Safari 打开，才能保存到主屏幕';
}

export function wechatMaskDesc(): string {
  if (isAndroid()) {
    return `微信里无法下载安装包。点右上角 ··· →「在浏览器打开」，再下载安装${BRAND_NAME}，从桌面一点就开。`;
  }
  return `微信里无法添加到主屏幕。点右上角 ··· →「在 Safari 打开」，再把${BRAND_NAME}加到主屏幕，下次一点就开。`;
}
