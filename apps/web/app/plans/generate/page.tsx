'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';

/** 旧入口：统一到计划 Tab 页。 */
export default function GeneratePlanRedirect() {
  const router = useRouter();
  useEdgeSwipeBack({ href: '/plans' });
  useEffect(() => {
    router.replace('/plans');
  }, [router]);
  return null;
}
