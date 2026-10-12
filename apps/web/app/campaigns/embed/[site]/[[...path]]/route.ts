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
  const prefix = embedPathPrefix(site, reqUrl);

  if (contentType.includes('text/html') || upstreamPath === '/') {
    const html = await upstreamRes.text();
    // 非 HTML 却当首页拉到了（偶发）→ 回退直链
    if (!contentType.includes('text/html') && !html.trimStart().toLowerCase().startsWith('<!doctype')) {
      return fallbackUpstreamHtml(upstream.toString());
    }
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
