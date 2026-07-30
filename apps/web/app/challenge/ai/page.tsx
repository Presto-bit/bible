'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';

export default function AiChallengeRedirect() {
  const router = useRouter();
  useEdgeSwipeBack({ href: '/challenge' });
  useEffect(() => {
    router.replace('/challenge');
  }, [router]);
  return null;
}
