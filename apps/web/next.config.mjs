/** @type {import('next').NextConfig} */
// 生产：https://2sc.prestoai.cn 根路径（BASE_PATH 为空）
// 旧路径兼容：NEXT_PUBLIC_BASE_PATH=/2sc
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig = {
  basePath,
  assetPrefix: basePath || undefined,
  output: 'standalone',
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_API_BASE:
      process.env.NEXT_PUBLIC_API_BASE || 'https://2sc.prestoai.cn',
  },
  async headers() {
    // 避免首页等 HTML 被 CDN/Nginx 按 s-maxage=31536000 缓存导致发版后仍显示旧版
    return [
      {
        source: '/((?!_next/static|_next/image|favicon.ico|icon-|apple-touch|manifest|sw\\.js).*)',
        headers: [{ key: 'Cache-Control', value: 'no-cache, must-revalidate' }],
      },
    ];
  },
};

export default nextConfig;
