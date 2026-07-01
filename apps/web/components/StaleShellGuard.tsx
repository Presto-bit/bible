'use client';

import { useEffect } from 'react';
import { BASE_PATH } from '@/lib/basePath';

function isLegacyHomeHtml(html: string): boolean {
  return (
    html.includes('3,842') ||
    html.includes('知识闯关') ||
    (!html.includes('每日问答') && html.includes('今日 12 分钟'))
  );
}

function isFreshHomeHtml(html: string): boolean {
  return html.includes('每日问答') && !html.includes('3,842');
}

function isHomePath(pathname: string): boolean {
  const base = BASE_PATH || '';
  if (base) {
    return pathname === base || pathname === `${base}/`;
  }
  return pathname === '/';
}

/**
 * 宝塔/Nginx 常只缓存精确路径 `/`（/?v=1 可绕过）。
 * 检测到陈旧首页壳时，用带参 URL 强制拉新版（含每日问答入口）。
 */
export default function StaleShellGuard() {
  useEffect(() => {
    if (!isHomePath(window.location.pathname)) return;

    const currentHtml = document.documentElement.outerHTML;
    if (!isLegacyHomeHtml(currentHtml)) return;

    const base = BASE_PATH || '';
    const home = `${base}/`;
    const bust = `_nc=${Date.now()}`;
    const freshUrl = `${window.location.origin}${home}?${bust}`;

    fetch(freshUrl, { cache: 'no-store' })
      .then((r) => r.text())
      .then((fresh) => {
        if (isFreshHomeHtml(fresh)) {
          window.location.replace(freshUrl);
        }
      })
      .catch(() => {});
  }, []);

  return null;
}
