/** 邀请码活动同站 embed：PWA iframe 内一等公民 storage，可抑制引导弹窗并稳定 session。 */

import { clientWithBasePath } from '@/lib/basePath';

export const CAMPAIGN_EMBED_SITES = {
  'hebrews-30': 'https://hebrews-30.pages.dev',
  'genesis-50': 'https://genesis-50.pages.dev',
} as const;

export type CampaignEmbedSite = keyof typeof CAMPAIGN_EMBED_SITES;

const EMBED_PREFIX = '/campaigns/embed';

export function isCampaignEmbedSite(site: string): site is CampaignEmbedSite {
  return Object.prototype.hasOwnProperty.call(CAMPAIGN_EMBED_SITES, site);
}

export function campaignEmbedSiteFromHref(href: string): CampaignEmbedSite | null {
  const t = (href || '').trim().toLowerCase();
  if (!t) return null;
  if (t.includes('hebrews-30') || t.includes('hebrews30') || t.includes('hebrews')) {
    return 'hebrews-30';
  }
  if (t.includes('genesis-50') || t.includes('genesis50')) {
    return 'genesis-50';
  }
  try {
    const host = new URL(t.startsWith('//') ? `https:${t}` : t).hostname.toLowerCase();
    if (host === 'hebrews-30.pages.dev' || host.endsWith('.hebrews-30.pages.dev')) {
      return 'hebrews-30';
    }
    if (host === 'genesis-50.pages.dev' || host.endsWith('.genesis-50.pages.dev')) {
      return 'genesis-50';
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** 浏览器内路径前缀（含 basePath），供 pathname shim 使用 */
export function campaignEmbedPathPrefix(site: CampaignEmbedSite): string {
  const path = `${EMBED_PREFIX}/${site}`;
  if (typeof window !== 'undefined') {
    return clientWithBasePath(path).replace(/\/$/, '') || path;
  }
  return path;
}

/**
 * 把活动站绝对 URL 转成彼爱同站 embed URL（保留 path/query）。
 * 非白名单域名原样返回。
 */
export function toCampaignEmbedUrl(targetHref: string): string {
  const raw = (targetHref || '').trim();
  if (!raw) return raw;
  try {
    const u = new URL(raw.startsWith('//') ? `https:${raw}` : raw);
    const site = campaignEmbedSiteFromHref(u.href);
    if (!site) return raw;
    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://2sc.prestoai.cn';
    const prefix = campaignEmbedPathPrefix(site);
    const restPath = u.pathname === '/' ? '/' : u.pathname;
    const embedPath = `${prefix}${restPath === '/' ? '/' : restPath}`;
    const out = new URL(embedPath, origin);
    out.search = u.search;
    out.hash = '';
    return out.toString();
  } catch {
    return raw;
  }
}

export function isCampaignEmbedHref(href: string): boolean {
  try {
    const u = new URL(
      (href || '').trim().startsWith('//')
        ? `https:${(href || '').trim()}`
        : (href || '').trim(),
      typeof window !== 'undefined' ? window.location.origin : 'https://2sc.prestoai.cn',
    );
    const path = u.pathname.replace(/\/+$/, '') || '/';
    const stripped = path.includes(EMBED_PREFIX)
      ? path.slice(path.indexOf(EMBED_PREFIX))
      : path;
    return stripped === EMBED_PREFIX || stripped.startsWith(`${EMBED_PREFIX}/`);
  } catch {
    return false;
  }
}

/** 注入：预写 session / 关闭引导与更新弹窗；pathname shim 让 SPA 路由以为在根路径。 */
export function buildCampaignEmbedBootScript(pathPrefix: string): string {
  const P = JSON.stringify(pathPrefix.replace(/\/$/, '') || pathPrefix);
  return `<script>(function(){var P=${P};try{localStorage.setItem("g50-onboarding-seen","1");localStorage.setItem("g50-whatsnew-seen-count","99");var q=new URLSearchParams(location.search);var at=q.get("access_token"),rt=q.get("refresh_token");if(at&&rt){var s={access_token:at,refresh_token:rt,expires_in:Number(q.get("expires_in")||3600),token_type:q.get("token_type")||"bearer"};var ea=q.get("expires_at");if(ea)s.expires_at=Number(ea);localStorage.setItem("sb-ytiwfmufekvxdgyaokae-auth-token",JSON.stringify(s));}}catch(e){}try{var d=Object.getOwnPropertyDescriptor(Location.prototype,"pathname");if(d&&d.get){Object.defineProperty(Location.prototype,"pathname",{configurable:!0,enumerable:!0,get:function(){var p=d.get.call(this);return p.indexOf(P)===0?(p.slice(P.length)||"/"):p}})}var w=function(fn){return function(state,title,url){if(typeof url==="string"&&url.charAt(0)==="/"&&url.indexOf(P)!==0){url=P+(url==="/"?"/":url)}return fn.call(this,state,title,url)}};history.pushState=w(history.pushState);history.replaceState=w(history.replaceState);}catch(e){}})();</script>`;
}

export function rewriteCampaignEmbedHtml(
  html: string,
  pathPrefix: string,
): string {
  const prefix = pathPrefix.replace(/\/$/, '') || pathPrefix;
  let out = html;
  out = out.replace(/(src|href)=(["'])\/(?!\/)/g, `$1=$2${prefix}/`);
  const boot = buildCampaignEmbedBootScript(prefix);
  if (out.includes('<head>')) {
    out = out.replace('<head>', `<head>${boot}`);
  } else if (out.includes('<body>')) {
    out = out.replace('<body>', `<body>${boot}`);
  } else {
    out = boot + out;
  }
  return out;
}
