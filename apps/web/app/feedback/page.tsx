'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { api, ensureAccountReady } from '@/lib/api';
import { OFFICIAL_SUPPORT_USER_CODE } from '@/lib/official_support';
import { markRouteNavigation } from '@/lib/pwa_tab_nav';

/** 兼容旧入口：反馈 → 官方客服私信。 */
export default function FeedbackPage() {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await ensureAccountReady();
        const dm = await api.openDm(OFFICIAL_SUPPORT_USER_CODE);
        if (cancelled) return;
        markRouteNavigation();
        router.replace(`/discover/dm/${dm.thread_id}`);
      } catch (e) {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : '暂时无法打开反馈，请稍后重试');
        markRouteNavigation();
        router.replace('/profile/settings');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="container" style={{ paddingTop: 48 }}>
      <p className="muted" style={{ fontSize: 14 }}>
        {err || '正在打开官方客服…'}
      </p>
    </main>
  );
}
