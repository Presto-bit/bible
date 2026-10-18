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
    // 根路径不要尾斜杠，避免 Next/Nginx 308 丢掉体验
    const restPath = u.pathname.replace(/\/+$/, '') || '';
    const embedPath = restPath ? `${prefix}${restPath}` : prefix;
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

/** 注入：预写完整 session（含 JWT 解码出的 user，防 supabase-js Tl() Proxy 抛错）并清掉 URL token 参数。 */
export function buildCampaignEmbedBootScript(
  pathPrefix: string,
  fallbackSession?: Record<string, unknown> | null,
): string {
  const FB = fallbackSession ? JSON.stringify(fallbackSession) : 'null';
  return `<script>(function(){var FB=${FB};try{localStorage.setItem("g50-onboarding-seen","1");localStorage.setItem("g50-whatsnew-seen-count","99");var q=new URLSearchParams(location.search);var at=q.get("access_token")||(FB&&FB.access_token)||"",rt=q.get("refresh_token")||(FB&&FB.refresh_token)||"";if(at&&rt){var ei=Number(q.get("expires_in")||(FB&&FB.expires_in)||3600);var ea=Number(q.get("expires_at")||(FB&&FB.expires_at))||(Math.floor(Date.now()/1000)+ei);var u=(FB&&FB.user)||null;if(!u){try{var b64=at.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");while(b64.length%4)b64+="=";var pl=JSON.parse(decodeURIComponent(escape(atob(b64))));if(pl&&pl.sub){u={id:pl.sub,aud:pl.aud||"authenticated",role:pl.role||"authenticated",email:pl.email||"",phone:pl.phone||"",app_metadata:pl.app_metadata||{},user_metadata:pl.user_metadata||{},identities:[],created_at:new Date().toISOString(),updated_at:new Date().toISOString()};}}catch(e){}}var sObj={access_token:at,refresh_token:rt,expires_in:ei,expires_at:ea,token_type:q.get("token_type")||(FB&&FB.token_type)||"bearer"};if(u)sObj.user=u;var s=JSON.stringify(sObj);var ks=["sb-ytiwfmufekvxdgyaokae-auth-token","sb-hebrews-30-auth-token","sb-genesis-50-auth-token","sb-"+location.hostname.split(".")[0]+"-auth-token"];for(var i=0;i<ks.length;i++){localStorage.setItem(ks[i],s);if(u)localStorage.setItem(ks[i]+"-user",JSON.stringify({user:u}));}if(u){try{var g50=JSON.parse(localStorage.getItem("g50-auth")||"{}");if(!g50||!g50.state||!g50.state.supabaseUser){localStorage.setItem("g50-auth",JSON.stringify({state:{supabaseUser:u,profile:(g50&&g50.state&&g50.state.profile)||null},version:0}));}}catch(e){}}try{["access_token","refresh_token","expires_in","expires_at","token_type","type","code","invite"].forEach(function(k){q.delete(k);});var qs=q.toString();history.replaceState(history.state,"",location.pathname+(qs?"?"+qs:"")+location.hash);}catch(e){}}}catch(e){}})();</script>`;
}

export function rewriteCampaignEmbedHtml(
  html: string,
  pathPrefix: string,
  fallbackSession?: Record<string, unknown> | null,
): string {
  const prefix = pathPrefix.replace(/\/$/, '') || pathPrefix;
  let out = html;
  // 安卓 WebView 的 onPageFinished 会等 favicon（现拉 pages.dev 常超时）；无 icon 声明时又会去请求根 /favicon.ico（404）。
  out = out.replace(/<link\b[^>]*\brel=(["'])(?:shortcut )?icon\1[^>]*>\s*/gi, '');
  out = out.replace(/(src|href)=(["'])\/(?!\/)/g, `$1=$2${prefix}/`);
  const boot = `<link rel="icon" href="data:,">${buildCampaignEmbedBootScript(prefix, fallbackSession)}`;
  if (out.includes('<head>')) {
    out = out.replace('<head>', `<head>${boot}`);
  } else if (out.includes('<body>')) {
    out = out.replace('<body>', `<body>${boot}`);
  } else {
    out = boot + out;
  }
  return out;
}
