'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { fetchAdminEligible } from '@/lib/admin_rag';
import { getSessionToken } from '@/lib/api';
import { isStandalonePwa } from '@/lib/platform';

/** 活动运营配置页：仅平台超管；PWA 内不提供配置（请用电脑浏览器）。 */
export function CampaignAdminGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'ok' | 'denied' | 'login' | 'pwa'>('loading');

  useEffect(() => {
    void (async () => {
      if (isStandalonePwa()) {
        setState('pwa');
        return;
      }
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
      <main className="ops-pc-shell">
        <p className="muted">加载中…</p>
      </main>
    );
  }
  if (state === 'pwa') {
    return (
      <main className="ops-pc-shell">
        <h1 className="ops-page-title">活动运营</h1>
        <div className="card ops-empty">
          <p>请在电脑浏览器中配置</p>
          <p className="muted" style={{ fontSize: 13, margin: '0 0 12px' }}>
            活动配置面向 PC 工作台，PWA / 手机端仅供成员参与活动，不做运营配置。
          </p>
          <Link href="/" className="btn">
            回首页
          </Link>
        </div>
      </main>
    );
  }
  if (state === 'login') {
    return (
      <main className="ops-pc-shell">
        <h1 className="ops-page-title">活动运营</h1>
        <div className="card ops-empty">
          <p>请先登录</p>
          <p className="muted" style={{ fontSize: 13, margin: '0 0 12px' }}>
            活动运营目前仅平台管理员可用，请在电脑浏览器登录后配置。
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
      <main className="ops-pc-shell">
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
