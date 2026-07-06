'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** 人生主题已下线，旧链接重定向到搜索 */
export default function TopicRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/search');
  }, [router]);
  return (
    <main className="container">
      <p className="muted">正在跳转…</p>
    </main>
  );
}
