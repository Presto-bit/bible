import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** 固定名静态资源：须走 next.config 长缓存，禁止本 middleware 盖成 no-store */
function isLongCacheAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/daily-wallpapers/')
    || pathname.startsWith('/rail-scenes/')
    || pathname.startsWith('/downloads/')
    || pathname.startsWith('/.well-known/')
  );
}

/**
 * 到达 Next 的 HTML/页面：禁止 CDN/反代长缓存（发版后立刻可见）。
 * 勿对风景壁纸 / 场景图下手——否则 no-store 会盖掉 next.config 的 max-age，
 * 且经 Nginx location / 后表现为「短/无缓存」。
 */
export function middleware(request: NextRequest) {
  if (isLongCacheAsset(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  response.headers.set(
    'Cache-Control',
    'private, no-cache, no-store, must-revalidate, max-age=0',
  );
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  if (request.nextUrl.pathname === '/') {
    response.headers.set('CDN-Cache-Control', 'no-store');
    response.headers.set('Surrogate-Control', 'no-store');
  }
  return response;
}

export const config = {
  // 与 isLongCacheAsset + 静态壳资源对齐；matcher 排除后中间件不进入
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|icon-|apple-touch|manifest|sw\\.js|daily-wallpapers/|rail-scenes/|downloads/|\\.well-known/).*)',
  ],
};
