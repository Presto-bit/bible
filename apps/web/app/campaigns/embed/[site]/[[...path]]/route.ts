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
  // 优先请求 path 上的实际前缀（含运行时 basePath）
  const marker = `/campaigns/embed/${site}`;
  const idx = requestUrl.pathname.indexOf(marker);
  if (idx >= 0) {
    return requestUrl.pathname.slice(0, idx + marker.length).replace(/\/$/, '') || marker;
  }
  return `${BASE_PATH}${marker}`.replace(/\/$/, '') || marker;
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
    upstreamRes = await fetch(upstream.toString(), {
      method: 'GET',
      headers: {
        Accept: request.headers.get('Accept') || '*/*',
        'User-Agent': request.headers.get('User-Agent') || 'PeiaiCampaignEmbed/1',
      },
      redirect: 'follow',
      cache: 'no-store',
    });
  } catch {
    return new Response('活动页暂时无法加载，请稍后重试', { status: 502 });
  }

  const contentType = upstreamRes.headers.get('content-type') || '';
  const prefix = embedPathPrefix(site, reqUrl);

  if (contentType.includes('text/html')) {
    const html = await upstreamRes.text();
    const rewritten = rewriteCampaignEmbedHtml(html, prefix);
    return new Response(rewritten, {
      status: upstreamRes.status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-Frame-Options': 'SAMEORIGIN',
      },
    });
  }

  const body = upstreamRes.body;
  const headers = new Headers();
  if (contentType) headers.set('Content-Type', contentType);
  const cacheControl = upstreamRes.headers.get('Cache-Control');
  if (cacheControl) headers.set('Cache-Control', cacheControl);
  else if (contentType.includes('javascript') || contentType.includes('css')) {
    headers.set('Cache-Control', 'public, max-age=86400');
  }
  headers.set('X-Frame-Options', 'SAMEORIGIN');

  return new Response(body, {
    status: upstreamRes.status,
    headers,
  });
}

type RouteCtx = { params: Promise<{ site: string; path?: string[] }> };

export async function GET(request: Request, ctx: RouteCtx) {
  const { site, path } = await ctx.params;
  return proxyCampaignEmbed(request, site, path);
}
