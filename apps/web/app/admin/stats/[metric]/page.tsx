'use client';

import { use } from 'react';
import Link from 'next/link';
import PageBackBar from '@/components/PageBackBar';
import AdminPcNav from '@/components/admin/AdminPcNav';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import AdminStatsDetailPanel from '@/components/admin/AdminStatsDetailPanel';
import { AdminLoginForm } from '@/components/admin/AdminLoginForm';
import { adminCheck, clearAdminToken } from '@/lib/admin_rag';
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

const METRIC_LABELS: Record<string, string> = {
  users: '注册用户',
  groups: '读经群',
  friendships: '好友关系',
  messages: '群消息',
  uv: '访问 UV',
  ai_requests: 'AI 请求',
  rag_documents: 'RAG 资料',
};

const NAV = [
  { href: '/admin?tab=stats', label: '数据预览', desc: '健康与趋势', id: 'stats' },
  { href: '/admin?tab=ops', label: '活动运营', desc: '今日推荐活动', id: 'ops' },
  { href: '/admin?tab=rag', label: 'RAG 注释库', desc: 'Notion 式资料', id: 'rag' },
] as const;

export default function AdminStatsDetailPage({
  params,
}: {
  params: Promise<{ metric: string }>;
}) {
  const { metric: raw } = use(params);
  const metric = raw as AdminStatsSeriesKey;
  const valid = VALID_METRICS.has(metric);
  const title = METRIC_LABELS[raw] ?? raw;

  useEdgeSwipeBack({ href: '/admin?tab=stats' });

  const [loggedIn, setLoggedIn] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    void adminCheck().then((ok) => {
      setLoggedIn(ok);
      setChecking(false);
    });
  }, []);

  const handleLogout = () => {
    clearAdminToken();
    setLoggedIn(false);
  };

  const panel = checking ? (
    <p className="muted" style={{ fontSize: 13 }}>验证登录…</p>
  ) : !loggedIn ? (
    <div className="settings-card admin-login-card">
      <AdminLoginForm onSuccess={() => setLoggedIn(true)} />
    </div>
  ) : !valid ? (
    <p className="muted">未知指标：{raw}</p>
  ) : (
    <div className="admin-stats-detail-panel">
      <AdminStatsDetailPanel metric={metric} />
    </div>
  );

  return (
    <main className="page admin-page admin-console admin-console-detail">
      <div className="admin-shell">
        <AdminPcNav
          items={NAV.map((n) => ({
            id: n.id,
            label: n.label,
            desc: n.desc,
            href: n.href,
            active: n.id === 'stats',
          }))}
          foot={
            <>
              <Link className="admin-pc-nav-ghost" href="/admin?tab=stats">
                <span className="admin-pc-nav-ghost-icon" aria-hidden>
                  ←
                </span>
                <span className="admin-pc-nav-ghost-label">数据概览</span>
              </Link>
              <a className="admin-pc-nav-ghost" href="/profile">
                <span className="admin-pc-nav-ghost-icon" aria-hidden>
                  ⌂
                </span>
                <span className="admin-pc-nav-ghost-label">返回我的</span>
              </a>
              {loggedIn ? (
                <button type="button" className="admin-pc-nav-ghost" onClick={handleLogout}>
                  <span className="admin-pc-nav-ghost-icon" aria-hidden>
                    ⎋
                  </span>
                  <span className="admin-pc-nav-ghost-label">退出</span>
                </button>
              ) : null}
            </>
          }
        />

        <div className="admin-shell-main">
          <div className="admin-mobile-chrome">
            <div className="admin-page-head page-head" style={{ marginBottom: 0 }}>
              <PageBackBar href="/admin?tab=stats" label="管理后台" />
              <span className="page-head-spacer" />
              {loggedIn ? (
                <button type="button" className="text-link" onClick={handleLogout}>
                  退出管理
                </button>
              ) : null}
            </div>
          </div>

          <header className="admin-pc-topbar">
            <div>
              <p className="muted admin-pc-breadcrumb">
                <Link href="/admin?tab=stats">数据预览</Link>
                <span aria-hidden> / </span>
                <span>{title}</span>
              </p>
              <h1 className="admin-pc-title">{title}明细</h1>
              <p className="muted admin-pc-subtitle">趋势、洞察与明细表</p>
            </div>
            <Link href="/admin?tab=stats" className="admin-pc-search-btn admin-pc-back-btn">
              <span>返回数据概览</span>
            </Link>
          </header>

          <div className="admin-shell-content admin-shell-content-stats-detail">{panel}</div>
        </div>
      </div>
    </main>
  );
}
