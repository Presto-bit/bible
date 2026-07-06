/** Standalone PWA：外链同 tab 打开，避免跳系统浏览器破坏「App 感」 */

import { isStandalonePwa } from './platform';

export function initPwaNavGuard() {
  if (typeof document === 'undefined' || !isStandalonePwa()) return;

  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest('a[href]');
    if (!(anchor instanceof HTMLAnchorElement)) return;
    if (anchor.target === '_blank' || anchor.hasAttribute('download')) return;

    let url: URL;
    try {
      url = new URL(anchor.href, window.location.href);
    } catch {
      return;
    }
    if (url.origin === window.location.origin) return;
    if (!/^https?:$/i.test(url.protocol)) return;

    e.preventDefault();
    window.location.assign(url.href);
  });
}

/** Standalone 与浏览器对齐 QA 清单（发版前人工勾选） */
export const PWA_STANDALONE_QA = [
  '主屏幕名称为「彼爱」，图标与 icon.svg 一致',
  '启动图极简品牌屏（彼爱 + 安静读经），背景 #FFFCFA',
  '竖屏锁定，无地址栏，底栏 Tab safe-area 正常',
  '外链在同一 WebView 内打开，不跳 Safari/Chrome',
  '清除缓存提示不误导（读经/笔记保留）',
  '发版后 SW bump，旧壳可提示刷新',
] as const;
