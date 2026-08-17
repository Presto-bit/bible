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
    // sw.js 必须 no-store：否则浏览器/反代延迟发现新 SW，TWA 长驻 WebView 吃旧壳
    return [
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, max-age=0',
          },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/.well-known/assetlinks.json',
        headers: [
          { key: 'Content-Type', value: 'application/json; charset=utf-8' },
          { key: 'Cache-Control', value: 'public, max-age=300' },
        ],
      },
      {
        source: '/downloads/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=300' }],
      },
      // 风景壁纸 / 横滑场景图：文件名固定，宜强缓存，避免壳每次 no-store 重下失败
      {
        source: '/daily-wallpapers/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=2592000, stale-while-revalidate=86400, immutable',
          },
        ],
      },
      {
        source: '/rail-scenes/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=2592000, stale-while-revalidate=86400, immutable',
          },
        ],
      },
      {
        // 排除静态插画壁纸（否则会覆盖为 no-cache，壳上背景常下失败）
        source:
          '/((?!_next/static|_next/image|favicon.ico|icon-|apple-touch|manifest|sw\\.js|daily-wallpapers/|rail-scenes/).*)',
        headers: [{ key: 'Cache-Control', value: 'no-cache, must-revalidate' }],
      },
    ];
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), 'sql.js'];
    }
    return config;
  },
  async redirects() {
    return [
      // 旧白名单空路由：协议类归入数据来源与许可
      { source: '/privacy', destination: '/profile/licenses', permanent: false },
      { source: '/terms', destination: '/profile/licenses', permanent: false },
    ];
  },
};

export default nextConfig;
