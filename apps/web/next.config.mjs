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
};

export default nextConfig;
