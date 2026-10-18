import {
  CAMPAIGN_EMBED_SITES,
  isCampaignEmbedSite,
  rewriteCampaignEmbedHtml,
  type CampaignEmbedSite,
} from '@/lib/campaign_embed';
import { BASE_PATH } from '@/lib/basePath';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPABASE_ORIGIN = 'https://ytiwfmufekvxdgyaokae.supabase.co';
const HTML_STALE_MS = 5 * 60 * 1000;

function embedPathPrefix(site: CampaignEmbedSite, requestUrl: URL): string {
  const marker = `/campaigns/embed/${site}`;
  const idx = requestUrl.pathname.indexOf(marker);
  if (idx >= 0) {
    return requestUrl.pathname.slice(0, idx + marker.length).replace(/\/$/, '') || marker;
  }
  return `${BASE_PATH}${marker}`.replace(/\/$/, '') || marker;
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 代理失败时回退到活动站直链，避免 iframe 卡在错误文案 */
function fallbackUpstreamHtml(upstreamUrl: string): Response {
  const safe = escapeHtmlAttr(upstreamUrl);
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta http-equiv="refresh" content="0;url=${safe}"/><title>打开活动</title><script>location.replace(${JSON.stringify(upstreamUrl)})</script></head><body style="font-family:system-ui;padding:24px;color:#666">正在打开活动…</body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  });
}

async function fetchUpstream(
  url: string,
  request?: Request,
  timeoutMs = 8000,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetch(url, {
        method: 'GET',
        headers: {
          Accept: request?.headers.get('Accept') || 'text/html,application/xhtml+xml,*/*',
          'User-Agent':
            request?.headers.get('User-Agent') ||
            'Mozilla/5.0 (compatible; PeiaiCampaignEmbed/1)',
          'Accept-Language': request?.headers.get('Accept-Language') || 'zh-CN,zh;q=0.9',
        },
        redirect: 'follow',
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('upstream fetch failed');
}

type CachedAsset = { body: Uint8Array; contentType: string };
type CachedHtml = { html: string; fetchedAt: number };

const ASSET_CACHE_MAX = 400;
const assetCache = new Map<string, CachedAsset>();
const assetInflight = new Map<string, Promise<CachedAsset | null>>();
const htmlCache = new Map<CampaignEmbedSite, CachedHtml>();
const htmlInflight = new Map<CampaignEmbedSite, Promise<string | null>>();

/** Vite 带 hash 的产物不可变，可长期缓存。 */
function isImmutableAsset(upstreamPath: string): boolean {
  return /^\/assets\/.+-[A-Za-z0-9_-]{6,}\.[a-z0-9]+$/i.test(upstreamPath);
}

/**
 * 1) Vite preload helper 把依赖拼成 `"/" + dep`（站点根）；挂在 embed 前缀下会 404 → 改写到 prefix 下。
 * 2) 活动站把 Supabase API 指到了 `https://<site>.pages.dev/api`，国内手机直连 pages.dev 常卡死 →
 *    改写为同源 `${location.origin}${prefix}/api`，由本路由直接转发到 Supabase。
 */
function rewriteEmbedJs(js: string, prefix: string): string {
  const apiExpr = `(location.origin+${JSON.stringify(`${prefix}/api`)})`;
  return js
    .replace(
      /function\((\w+)\)\{return\s*([`"'])\/\2\s*\+\s*\1\}/g,
      (_m, arg: string) => `function(${arg}){return ${JSON.stringify(`${prefix}/`)}+${arg}}`,
    )
    .replace(
      /\((\w+)\)=>([`"'])\/\2\s*\+\s*\1(?=[,;)}])/g,
      (_m, arg: string) => `(${arg})=>${JSON.stringify(`${prefix}/`)}+${arg}`,
    )
    .replace(
      /([`"'])https:\/\/(?:hebrews-30|genesis-50)\.pages\.dev\/api\1/g,
      apiExpr,
    );
}

async function loadImmutableAsset(
  upstreamUrl: string,
  request: Request | undefined,
  prefix: string,
): Promise<CachedAsset | null> {
  const cacheKey = `${prefix}::${upstreamUrl}`;
  const hit = assetCache.get(cacheKey);
  if (hit) return hit;
  const pending = assetInflight.get(cacheKey);
  if (pending) return pending;
  const job = (async () => {
    try {
      const res = await fetchUpstream(upstreamUrl, request, 25000);
      if (!res.ok) return null;
      const contentType = res.headers.get('content-type') || '';
      let body: Uint8Array;
      if (contentType.includes('javascript') || upstreamUrl.endsWith('.js')) {
        body = new TextEncoder().encode(rewriteEmbedJs(await res.text(), prefix));
      } else {
        body = new Uint8Array(await res.arrayBuffer());
      }
      const entry = { body, contentType };
      if (assetCache.size >= ASSET_CACHE_MAX) {
        const oldest = assetCache.keys().next().value;
        if (oldest) assetCache.delete(oldest);
      }
      assetCache.set(cacheKey, entry);
      return entry;
    } catch (err) {
      console.warn('[campaign-embed] asset fetch failed', upstreamUrl, err);
      return null;
    } finally {
      assetInflight.delete(cacheKey);
    }
  })();
  assetInflight.set(cacheKey, job);
  return job;
}

/** 首页 HTML 返回时后台预热首屏资源，避免 WebView 串行等 pages.dev。 */
function warmHtmlAssets(
  html: string,
  upstreamOrigin: string,
  request: Request | undefined,
  prefix: string,
) {
  const re = /(?:src|href)=["'](\/assets\/[^"']+)["']/g;
  for (const m of html.matchAll(re)) {
    const path = m[1];
    if (!isImmutableAsset(path)) continue;
    void loadImmutableAsset(new URL(path, upstreamOrigin).toString(), request, prefix);
  }
}

async function fetchAndCacheSiteHtml(
  site: CampaignEmbedSite,
  prefix: string,
  request?: Request,
): Promise<string | null> {
  const pending = htmlInflight.get(site);
  if (pending) return pending;
  const upstreamOrigin = CAMPAIGN_EMBED_SITES[site];
  const job = (async () => {
    try {
      const res = await fetchUpstream(`${upstreamOrigin}/`, request, 10000);
      if (!res.ok) return null;
      const html = await res.text();
      if (!html.trimStart().toLowerCase().startsWith('<!doctype')) return null;
      htmlCache.set(site, { html, fetchedAt: Date.now() });
      warmHtmlAssets(html, upstreamOrigin, request, prefix);
      return html;
    } catch (err) {
      console.warn('[campaign-embed] html fetch failed', site, err);
      return null;
    } finally {
      htmlInflight.delete(site);
    }
  })();
  htmlInflight.set(site, job);
  return job;
}

async function getSiteHtml(
  site: CampaignEmbedSite,
  prefix: string,
  request?: Request,
): Promise<string | null> {
  const cached = htmlCache.get(site);
  if (cached) {
    if (Date.now() - cached.fetchedAt > HTML_STALE_MS) {
      void fetchAndCacheSiteHtml(site, prefix, request);
    } else {
      warmHtmlAssets(cached.html, CAMPAIGN_EMBED_SITES[site], request, prefix);
    }
    return cached.html;
  }
  return fetchAndCacheSiteHtml(site, prefix, request);
}

// 模块加载后立即在后台预热两个活动站首页与首屏 JS/CSS，首个用户打开即命中内存。
setTimeout(() => {
  for (const site of Object.keys(CAMPAIGN_EMBED_SITES) as CampaignEmbedSite[]) {
    const prefix = `${BASE_PATH}/campaigns/embed/${site}`.replace(/\/$/, '');
    void fetchAndCacheSiteHtml(site, prefix);
  }
}, 50);

/** 同源转发 `/campaigns/embed/<site>/api/*` → Supabase，绕开国内无法直连的 pages.dev。 */
async function proxyCampaignSupabaseApi(
  request: Request,
  apiPathParts: string[],
): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });
  }
  const reqUrl = new URL(request.url);
  const sub = apiPathParts.join('/');
  const target = new URL(`/${sub}`, SUPABASE_ORIGIN);
  target.search = reqUrl.search;

  const fwdHeaders = new Headers();
  for (const key of [
    'apikey',
    'authorization',
    'content-type',
    'accept',
    'prefer',
    'range',
    'x-client-info',
  ]) {
    const v = request.headers.get(key);
    if (v) fwdHeaders.set(key, v);
  }

  const hasBody = !['GET', 'HEAD'].includes(request.method.toUpperCase());
  const body = hasBody ? await request.arrayBuffer() : undefined;

  try {
    const res = await fetch(target.toString(), {
      method: request.method,
      headers: fwdHeaders,
      body,
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    const outHeaders = new Headers();
    for (const key of ['content-type', 'content-range', 'preference-applied', 'cache-control']) {
      const v = res.headers.get(key);
      if (v) outHeaders.set(key, v);
    }
    return new Response(res.body, {
      status: res.status,
      headers: outHeaders,
    });
  } catch (err) {
    console.warn('[campaign-embed] supabase api proxy failed', target.toString(), err);
    return new Response(JSON.stringify({ error: 'upstream_timeout' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

function isSpaRoutePath(upstreamPath: string): boolean {
  if (upstreamPath === '/') return true;
  if (upstreamPath.startsWith('/assets/') || upstreamPath.startsWith('/api/')) return false;
  return !/\.[a-z0-9]{1,8}$/i.test(upstreamPath);
}

async function proxyCampaignEmbed(
  request: Request,
  site: string,
  pathParts: string[] | undefined,
): Promise<Response> {
  if (!isCampaignEmbedSite(site)) {
    return new Response('Not Found', { status: 404 });
  }
  const parts = pathParts || [];
  if (parts[0] === 'api') {
    return proxyCampaignSupabaseApi(request, parts.slice(1));
  }

  const upstreamOrigin = CAMPAIGN_EMBED_SITES[site];
  const reqUrl = new URL(request.url);
  const subPath = parts.join('/');
  const upstreamPath = subPath ? `/${subPath}` : '/';
  const upstream = new URL(upstreamPath, upstreamOrigin);
  upstream.search = reqUrl.search;
  const prefix = embedPathPrefix(site, reqUrl);

  if (isImmutableAsset(upstreamPath)) {
    const asset = await loadImmutableAsset(upstream.toString(), request, prefix);
    if (asset) {
      return new Response(asset.body, {
        status: 200,
        headers: {
          'Content-Type': asset.contentType || 'application/octet-stream',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }
  }

  // SPA 页面路由（`/`、`/1`、`/0` 等）：直接用内存缓存的 index.html 注入登录态返回，0ms 首包。
  if (isSpaRoutePath(upstreamPath)) {
    const html = await getSiteHtml(site, prefix, request);
    if (html) {
      const rewritten = rewriteCampaignEmbedHtml(html, prefix);
      return new Response(rewritten, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'private, no-store',
        },
      });
    }
    return fallbackUpstreamHtml(upstream.toString());
  }

  let upstreamRes: Response;
  try {
    upstreamRes = await fetchUpstream(upstream.toString(), request);
  } catch (err) {
    console.warn('[campaign-embed] upstream fetch failed', site, upstream.toString(), err);
    return new Response('Upstream Timeout', { status: 504 });
  }

  const contentType = upstreamRes.headers.get('content-type') || '';
  const headers = new Headers();
  if (contentType) headers.set('Content-Type', contentType);
  const cacheControl = upstreamRes.headers.get('Cache-Control');
  if (cacheControl) headers.set('Cache-Control', cacheControl);
  else if (contentType.includes('javascript') || contentType.includes('css')) {
    headers.set('Cache-Control', 'public, max-age=86400');
  }

  if (contentType.includes('javascript') || upstreamPath.endsWith('.js')) {
    return new Response(rewriteEmbedJs(await upstreamRes.text(), prefix), {
      status: upstreamRes.status,
      headers,
    });
  }

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers,
  });
}

type RouteCtx = { params: Promise<{ site: string; path?: string[] }> };

export async function GET(request: Request, ctx: RouteCtx) {
  const { site, path } = await ctx.params;
  return proxyCampaignEmbed(request, site, path);
}

export async function POST(request: Request, ctx: RouteCtx) {
  const { site, path } = await ctx.params;
  return proxyCampaignEmbed(request, site, path);
}

export async function PUT(request: Request, ctx: RouteCtx) {
  const { site, path } = await ctx.params;
  return proxyCampaignEmbed(request, site, path);
}

export async function PATCH(request: Request, ctx: RouteCtx) {
  const { site, path } = await ctx.params;
  return proxyCampaignEmbed(request, site, path);
}

export async function DELETE(request: Request, ctx: RouteCtx) {
  const { site, path } = await ctx.params;
  return proxyCampaignEmbed(request, site, path);
}

export async function OPTIONS(request: Request, ctx: RouteCtx) {
  const { site, path } = await ctx.params;
  return proxyCampaignEmbed(request, site, path);
}
