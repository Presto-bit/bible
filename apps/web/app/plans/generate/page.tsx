'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** 旧入口：统一到计划 Tab 页。 */
export default function GeneratePlanRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/plans');
  }, [router]);
  return null;
}
