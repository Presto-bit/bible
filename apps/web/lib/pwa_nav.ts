/** Standalone PWA：外链同 tab 打开，避免跳系统浏览器破坏「App 感」 */

import { isStandalonePwa } from './platform';

const SKIP_TOUCH_TARGET =
  'input, textarea, select, [contenteditable="true"], .allow-text-select';

function markAnchorNoDrag(anchor: HTMLAnchorElement) {
  anchor.setAttribute('draggable', 'false');
  anchor.style.setProperty('-webkit-user-drag', 'none');
}

/** 阻止 iOS 长按链接弹出 URL 预览：CSS + draggable；勿 touchstart preventDefault（会阻断 Link 点击）。 */
export function initPwaLinkPreviewGuard() {
  if (typeof document === 'undefined' || !isStandalonePwa()) return;

  const scanAnchors = (root: ParentNode = document) => {
    root.querySelectorAll('a[href]').forEach((node) => {
      if (node instanceof HTMLAnchorElement) markAnchorNoDrag(node);
    });
  };

  scanAnchors();
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList') {
        m.addedNodes.forEach((node) => {
          if (node instanceof HTMLAnchorElement) markAnchorNoDrag(node);
          else if (node instanceof Element) scanAnchors(node);
        });
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

export function initPwaContextMenuGuard() {
  if (typeof document === 'undefined' || !isStandalonePwa()) return;

  const blockMenu = (e: Event) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.closest(SKIP_TOUCH_TARGET)) return;
    e.preventDefault();
  };

  document.addEventListener('contextmenu', blockMenu, { capture: true });
}

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
  '主屏幕 / 安卓安装包名称为「彼爱」，图标一致',
  '启动图品牌屏（彼爱 + 安静读经），背景 #E32626；进站后壳层 #FFFCFA',
  '竖屏锁定，无地址栏（assetlinks 校验通过），底栏 Tab safe-area 正常',
  '安卓官网包以 Chrome 渲染（与 iOS Safari standalone 同级）；半屏/手势无需 WebView 特判',
  '深色主题时状态栏图标与底色与页面一致',
  '读经提醒：Chrome Host 经 peiai:// 调度本地闹钟；可引导关闭电池优化',
  '清除缓存提示不误导（读经/笔记保留）；Chrome Host 不依赖 clearWebViewCache',
  '发版后 SW bump；Chrome 标准更新即可，无需壳内硬清 HTTP 缓存',
  '安装包有新 versionName 时半屏提示更新；旧 WebView 壳 / 主屏幕快捷方式引导装 2.0+',
] as const;
