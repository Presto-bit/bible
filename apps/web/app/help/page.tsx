'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { markRouteNavigation } from '@/lib/pwa_tab_nav';

/** 帮助中心 → 产品说明（兼容旧链）。 */
export default function HelpPage() {
  const router = useRouter();

  useEffect(() => {
    markRouteNavigation();
    router.replace('/help/product');
  }, [router]);

  return (
    <main className="container" style={{ paddingTop: 48 }}>
      <p className="muted" style={{ fontSize: 14 }}>
        正在打开产品说明…
      </p>
    </main>
  );
}
