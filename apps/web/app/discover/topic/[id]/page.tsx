'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';

/** 人生主题产品已删除；旧 /discover/topic/* 深链回落搜索 */
export default function TopicRedirectPage() {
  const router = useRouter();
  useEdgeSwipeBack({ href: '/discover' });
  useEffect(() => {
    router.replace('/search');
  }, [router]);
  return (
    <main className="container">
      <p className="muted">正在跳转…</p>
    </main>
  );
}
