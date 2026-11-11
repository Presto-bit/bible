'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { markRouteNavigation } from '@/lib/pwa_tab_nav';

/** 兼容旧入口：反馈 → 帮助与反馈表单。 */
export default function FeedbackPage() {
  const router = useRouter();

  useEffect(() => {
    markRouteNavigation();
    router.replace('/help/feedback');
  }, [router]);

  return (
    <main className="container" style={{ paddingTop: 48 }}>
      <p className="muted" style={{ fontSize: 14 }}>
        正在打开帮助与反馈…
      </p>
    </main>
  );
}
