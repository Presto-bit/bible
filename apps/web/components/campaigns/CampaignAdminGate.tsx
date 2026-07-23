'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { fetchAdminEligible } from '@/lib/admin_rag';
import { getSessionToken } from '@/lib/api';
import { isStandalonePwa } from '@/lib/platform';
import { OpsPcShell } from '@/components/campaigns/OpsPcShell';

function GateMessage({
  embedded,
  title,
  body,
  action,
}: {
  embedded?: boolean;
  title: string;
  body: string;
  action: ReactNode;
}) {
  const card = (
    <div className="card ops-empty">
      <p>{title}</p>
      <p className="muted" style={{ fontSize: 13, margin: '0 0 12px' }}>
        {body}
      </p>
      {action}
    </div>
  );
  if (embedded) return <div className="ops-list-panel is-embedded">{card}</div>;
  return (
    <OpsPcShell title="活动运营" backHref="/admin?tab=ops" backLabel="管理后台">
      {card}
    </OpsPcShell>
  );
}

/** 活动运营配置页：仅平台超管；PWA 内不提供配置（请用电脑浏览器）。 */
export function CampaignAdminGate({
  children,
  embedded = false,
}: {
  children: ReactNode;
  embedded?: boolean;
}) {
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
    if (embedded) {
      return (
        <div className="ops-list-panel is-embedded">
          <p className="muted">加载中…</p>
        </div>
      );
    }
    return (
      <OpsPcShell title="活动运营" backHref={null}>
        <p className="muted">加载中…</p>
      </OpsPcShell>
    );
  }
  if (state === 'pwa') {
    return (
      <GateMessage
        embedded={embedded}
        title="请在电脑浏览器中配置"
        body="活动配置面向 PC 工作台，PWA / 手机端仅供成员参与活动，不做运营配置。"
        action={
          <Link href="/" className="btn">
            回首页
          </Link>
        }
      />
    );
  }
  if (state === 'login') {
    return (
      <GateMessage
        embedded={embedded}
        title="请先登录"
        body="活动运营目前仅平台管理员可用，请在电脑浏览器登录后配置。"
        action={
          <Link href="/profile" className="btn btn-primary">
            去登录
          </Link>
        }
      />
    );
  }
  if (state === 'denied') {
    return (
      <GateMessage
        embedded={embedded}
        title="暂无权限"
        body="活动运营目前仅平台管理员可见与配置。"
        action={
          <Link href="/" className="btn">
            回首页
          </Link>
        }
      />
    );
  }
  return <>{children}</>;
}
