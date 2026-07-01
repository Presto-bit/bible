import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** 请求到达 Next 时禁止 CDN/Nginx 缓存 HTML（若外层仍缓存 /，须在宝塔关闭全站缓存） */
export function middleware(request: NextRequest) {
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon-|apple-touch|manifest|sw\\.js).*)'],
};
