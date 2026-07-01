import HomePageClient from '@/components/HomePage';

// 首页曾被 Next 静态预渲染 + s-maxage=31536000，Nginx/CDN 会长期缓存旧 HTML
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function HomePage() {
  return <HomePageClient />;
}
