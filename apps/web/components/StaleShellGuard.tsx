'use client';

import { useEffect } from 'react';
import { BASE_PATH } from '@/lib/basePath';

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || 'dev';

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

function htmlMatchesVersion(html: string, version: string): boolean {
  if (version === 'dev') return isFreshHomeHtml(html);
  return (
    html.includes(`name="app-version" content="${version}"`)
    || html.includes(`content="${version}"`)
  );
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
 * 优先比对 app-version meta；回退到旧版首页特征检测。
 */
export default function StaleShellGuard() {
  useEffect(() => {
    if (!isHomePath(window.location.pathname)) return;

    const version =
      document.querySelector('meta[name="app-version"]')?.getAttribute('content') || APP_VERSION;
    const currentHtml = document.documentElement.outerHTML;

    if (version !== 'dev' && htmlMatchesVersion(currentHtml, version)) return;
    if (!isLegacyHomeHtml(currentHtml)) return;

    const base = BASE_PATH || '';
    const home = `${base}/`;
    const bust = `_nc=${Date.now()}`;
    const freshUrl = `${window.location.origin}${home}?${bust}`;

    fetch(freshUrl, { cache: 'no-store' })
      .then((r) => r.text())
      .then((fresh) => {
        if (htmlMatchesVersion(fresh, version) || isFreshHomeHtml(fresh)) {
          window.location.replace(freshUrl);
        }
      })
      .catch(() => {});
  }, []);

  return null;
}
