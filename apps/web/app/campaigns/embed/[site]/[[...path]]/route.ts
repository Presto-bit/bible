import {
  CAMPAIGN_EMBED_SITES,
  isCampaignEmbedSite,
  rewriteCampaignEmbedHtml,
  type CampaignEmbedSite,
} from '@/lib/campaign_embed';
import { BASE_PATH } from '@/lib/basePath';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

async function fetchUpstream(url: string, request: Request): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetch(url, {
        method: 'GET',
        headers: {
          Accept: request.headers.get('Accept') || 'text/html,application/xhtml+xml,*/*',
          'User-Agent':
            request.headers.get('User-Agent') ||
            'Mozilla/5.0 (compatible; PeiaiCampaignEmbed/1)',
          'Accept-Language': request.headers.get('Accept-Language') || 'zh-CN,zh;q=0.9',
        },
        redirect: 'follow',
        cache: 'no-store',
      });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('upstream fetch failed');
}

type CachedAsset = { body: Uint8Array; contentType: string };

const ASSET_CACHE_MAX = 400;
const assetCache = new Map<string, CachedAsset>();
const assetInflight = new Map<string, Promise<CachedAsset | null>>();

/** Vite 带 hash 的产物不可变，可长期缓存。 */
function isImmutableAsset(upstreamPath: string): boolean {
  return /^\/assets\/.+-[A-Za-z0-9_-]{6,}\.[a-z0-9]+$/i.test(upstreamPath);
}

/**
 * Vite preload helper 把依赖拼成 `"/" + dep`（站点根）；挂在 embed 前缀下会 404，
 * CSS 预加载失败即抛错 → 懒加载页面整页白屏。
 */
function rewriteEmbedJs(js: string, prefix: string): string {
  return js
    .replace(
      /function\((\w+)\)\{return\s*([`"'])\/\2\s*\+\s*\1\}/g,
      (_m, arg: string) => `function(${arg}){return ${JSON.stringify(`${prefix}/`)}+${arg}}`,
    )
    .replace(
      /\((\w+)\)=>([`"'])\/\2\s*\+\s*\1(?=[,;)}])/g,
      (_m, arg: string) => `(${arg})=>${JSON.stringify(`${prefix}/`)}+${arg}`,
    );
}

async function loadImmutableAsset(
  upstreamUrl: string,
  request: Request,
  prefix: string,
): Promise<CachedAsset | null> {
  const hit = assetCache.get(upstreamUrl);
  if (hit) return hit;
  const pending = assetInflight.get(upstreamUrl);
  if (pending) return pending;
  const job = (async () => {
    try {
      const res = await fetchUpstream(upstreamUrl, request);
      if (!res.ok) return null;
      const contentType = res.headers.get('content-type') || '';
      let body: Uint8Array;
      if (contentType.includes('javascript')) {
        body = new TextEncoder().encode(rewriteEmbedJs(await res.text(), prefix));
      } else {
        body = new Uint8Array(await res.arrayBuffer());
      }
      const entry = { body, contentType };
      if (assetCache.size >= ASSET_CACHE_MAX) {
        const oldest = assetCache.keys().next().value;
        if (oldest) assetCache.delete(oldest);
      }
      assetCache.set(upstreamUrl, entry);
      return entry;
    } catch (err) {
      console.warn('[campaign-embed] asset fetch failed', upstreamUrl, err);
      return null;
    } finally {
      assetInflight.delete(upstreamUrl);
    }
  })();
  assetInflight.set(upstreamUrl, job);
  return job;
}

/** 首页 HTML 返回时后台预热首屏资源，避免 WebView 串行等 pages.dev。 */
function warmHtmlAssets(html: string, upstreamOrigin: string, request: Request, prefix: string) {
  const re = /(?:src|href)=["'](\/assets\/[^"']+)["']/g;
  for (const m of html.matchAll(re)) {
    const path = m[1];
    if (!isImmutableAsset(path)) continue;
    void loadImmutableAsset(new URL(path, upstreamOrigin).toString(), request, prefix);
  }
}

async function proxyCampaignEmbed(
  request: Request,
  site: string,
  pathParts: string[] | undefined,
): Promise<Response> {
  if (!isCampaignEmbedSite(site)) {
    return new Response('Not Found', { status: 404 });
  }
  const upstreamOrigin = CAMPAIGN_EMBED_SITES[site];
  const reqUrl = new URL(request.url);
  const subPath = (pathParts || []).join('/');
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

  let upstreamRes: Response;
  try {
    upstreamRes = await fetchUpstream(upstream.toString(), request);
  } catch (err) {
    console.warn('[campaign-embed] upstream fetch failed', site, upstream.toString(), err);
    return fallbackUpstreamHtml(upstream.toString());
  }

  if (!upstreamRes.ok && upstreamRes.status >= 500) {
    console.warn('[campaign-embed] upstream status', upstreamRes.status, upstream.toString());
    return fallbackUpstreamHtml(upstream.toString());
  }

  const contentType = upstreamRes.headers.get('content-type') || '';

  if (contentType.includes('text/html') || upstreamPath === '/') {
    const html = await upstreamRes.text();
    // 非 HTML 却当首页拉到了（偶发）→ 回退直链
    if (!contentType.includes('text/html') && !html.trimStart().toLowerCase().startsWith('<!doctype')) {
      return fallbackUpstreamHtml(upstream.toString());
    }
    warmHtmlAssets(html, upstreamOrigin, request, prefix);
    const rewritten = rewriteCampaignEmbedHtml(html, prefix);
    return new Response(rewritten, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
      },
    });
  }

  const headers = new Headers();
  if (contentType) headers.set('Content-Type', contentType);
  const cacheControl = upstreamRes.headers.get('Cache-Control');
  if (cacheControl) headers.set('Cache-Control', cacheControl);
  else if (contentType.includes('javascript') || contentType.includes('css')) {
    headers.set('Cache-Control', 'public, max-age=86400');
  }

  if (contentType.includes('javascript')) {
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
