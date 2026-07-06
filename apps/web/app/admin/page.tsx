'use client';

import PageBackBar from '@/components/PageBackBar';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { useEffect, useState } from 'react';
import AdminRagPanel, { AdminLoginForm } from '@/components/AdminRagPanel';
import AdminStatsPanel from '@/components/AdminStatsPanel';
import { adminCheck, clearAdminToken } from '@/lib/admin_rag';

type AdminTab = 'rag' | 'stats';

export default function AdminPage() {
  useEdgeSwipeBack({ href: '/profile' });

  const [tab, setTab] = useState<AdminTab>('rag');
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

  return (
    <main className="page admin-page">
      <div className="admin-page-head page-head" style={{ marginBottom: 0 }}>
        <PageBackBar href="/profile" label="我的" />
        <span className="page-head-spacer" />
        {loggedIn ? (
          <button type="button" className="text-link" onClick={handleLogout}>
            退出管理
          </button>
        ) : null}
      </div>

      <h1 className="admin-page-title">管理后台</h1>

      {checking ? (
        <p className="muted" style={{ fontSize: 13 }}>验证登录…</p>
      ) : !loggedIn ? (
        <div className="settings-card">
          <AdminLoginForm onSuccess={() => setLoggedIn(true)} />
        </div>
      ) : (
        <>
          <div className="admin-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'rag'}
              className={`admin-tab ${tab === 'rag' ? 'admin-tab-active' : ''}`}
              onClick={() => setTab('rag')}
            >
              RAG 注释库
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'stats'}
              className={`admin-tab ${tab === 'stats' ? 'admin-tab-active' : ''}`}
              onClick={() => setTab('stats')}
            >
              数据概览
            </button>
          </div>

          <div className="settings-card admin-tab-panel">
            {tab === 'rag' ? <AdminRagPanel showLogout={false} /> : <AdminStatsPanel />}
          </div>
        </>
      )}
    </main>
  );
}
