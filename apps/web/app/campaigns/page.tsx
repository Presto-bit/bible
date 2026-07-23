'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** 活动列表已并入管理后台「活动运营」tab；旧链接重定向。 */
export default function CampaignsListPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin?tab=ops');
  }, [router]);
  return (
    <main className="container">
      <p className="muted">正在打开活动运营…</p>
    </main>
  );
}
