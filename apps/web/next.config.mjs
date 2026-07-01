/** @type {import('next').NextConfig} */
// H5 部署在 www.prestoai.cn/2sc，故 basePath/assetPrefix 指向 /2sc。
const nextConfig = {
  basePath: '/2sc',
  assetPrefix: '/2sc',
  output: 'standalone',
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_BASE:
      process.env.NEXT_PUBLIC_API_BASE || 'https://www.prestoai.cn',
  },
};

export default nextConfig;
