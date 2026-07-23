'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { fetchAdminEligible } from '@/lib/admin_rag';
import { getSessionToken } from '@/lib/api';

/** 活动运营配置页：本期仅平台超管可进入。落地页消费不走此门禁。 */
export function CampaignAdminGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'ok' | 'denied' | 'login'>('loading');

  useEffect(() => {
    void (async () => {
      if (!getSessionToken()) {
        setState('login');
        return;
      }
      const ok = await fetchAdminEligible().catch(() => false);
      setState(ok ? 'ok' : 'denied');
    })();
  }, []);

  if (state === 'loading') {
    return (
      <main className="container ops-page">
        <p className="muted">加载中…</p>
      </main>
    );
  }
  if (state === 'login') {
    return (
      <main className="container ops-page">
        <h1 className="ops-page-title">活动运营</h1>
        <div className="card ops-empty">
          <p>请先登录</p>
          <p className="muted" style={{ fontSize: 13, margin: '0 0 12px' }}>
            活动运营目前仅平台管理员可用。
          </p>
          <Link href="/profile" className="btn btn-primary">
            去登录
          </Link>
        </div>
      </main>
    );
  }
  if (state === 'denied') {
    return (
      <main className="container ops-page">
        <h1 className="ops-page-title">活动运营</h1>
        <div className="card ops-empty">
          <p>暂无权限</p>
          <p className="muted" style={{ fontSize: 13, margin: '0 0 12px' }}>
            活动运营目前仅平台管理员可见与配置。
          </p>
          <Link href="/" className="btn">
            回首页
          </Link>
        </div>
      </main>
    );
  }
  return <>{children}</>;
}
