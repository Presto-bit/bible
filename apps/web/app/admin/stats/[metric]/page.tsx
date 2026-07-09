'use client';

import { use } from 'react';
import PageBackBar from '@/components/PageBackBar';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import AdminStatsDetailPanel from '@/components/admin/AdminStatsDetailPanel';
import { AdminLoginForm } from '@/components/AdminRagPanel';
import { adminCheck } from '@/lib/admin_rag';
import type { AdminStatsSeriesKey } from '@/lib/admin_rag';
import { useEffect, useState } from 'react';

const VALID_METRICS = new Set<AdminStatsSeriesKey>([
  'users',
  'groups',
  'friendships',
  'messages',
  'uv',
  'ai_requests',
  'rag_documents',
]);

export default function AdminStatsDetailPage({
  params,
}: {
  params: Promise<{ metric: string }>;
}) {
  const { metric: raw } = use(params);
  const metric = raw as AdminStatsSeriesKey;
  const valid = VALID_METRICS.has(metric);

  useEdgeSwipeBack({ href: '/admin?tab=stats' });

  const [loggedIn, setLoggedIn] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    void adminCheck().then((ok) => {
      setLoggedIn(ok);
      setChecking(false);
    });
  }, []);

  return (
    <main className="page admin-page">
      <div className="admin-page-head page-head" style={{ marginBottom: 0 }}>
        <PageBackBar href="/admin?tab=stats" label="管理后台" />
        <span className="page-head-spacer" />
      </div>

      {checking ? (
        <p className="muted" style={{ fontSize: 13 }}>验证登录…</p>
      ) : !loggedIn ? (
        <div className="settings-card">
          <AdminLoginForm onSuccess={() => setLoggedIn(true)} />
        </div>
      ) : !valid ? (
        <p className="muted">未知指标：{raw}</p>
      ) : (
        <div className="settings-card admin-tab-panel">
          <AdminStatsDetailPanel metric={metric} />
        </div>
      )}
    </main>
  );
}
