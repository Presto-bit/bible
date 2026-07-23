'use client';

import PageBackBar from '@/components/PageBackBar';
import AdminCommandPalette, { type AdminTab } from '@/components/admin/AdminCommandPalette';
import AdminPcNav from '@/components/admin/AdminPcNav';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AdminLoginForm } from '@/components/admin/AdminLoginForm';
import AdminRagWorkspace from '@/components/admin/AdminRagWorkspace';
import AdminStatsPanel from '@/components/AdminStatsPanel';
import AdminModerationPanel from '@/components/admin/AdminModerationPanel';
import { CampaignAdminGate } from '@/components/campaigns/CampaignAdminGate';
import { CampaignsListPanel } from '@/components/campaigns/CampaignsListPanel';
import { adminCheck, clearAdminToken } from '@/lib/admin_rag';

function parseTab(value: string | null): AdminTab {
  if (value === 'ops' || value === 'rag' || value === 'stats' || value === 'moderation') return value;
  return 'stats';
}

const NAV: { id: AdminTab; label: string; desc: string }[] = [
  { id: 'stats', label: '数据预览', desc: '健康与趋势' },
  { id: 'ops', label: '活动运营', desc: '今日推荐活动' },
  { id: 'moderation', label: '内容审核', desc: '举报与异端工单' },
  { id: 'rag', label: 'RAG 注释库', desc: 'Notion 式资料' },
];

function AdminPageInner() {
  useEdgeSwipeBack({ href: '/profile' });
  const searchParams = useSearchParams();
  const router = useRouter();

  const [tab, setTab] = useState<AdminTab>(() => parseTab(searchParams.get('tab')));
  const [loggedIn, setLoggedIn] = useState(false);
  const [checking, setChecking] = useState(true);
  const [cmdOpen, setCmdOpen] = useState(false);

  useEffect(() => {
    void adminCheck().then((ok) => {
      setLoggedIn(ok);
      setChecking(false);
    });
  }, []);

  useEffect(() => {
    setTab(parseTab(searchParams.get('tab')));
  }, [searchParams]);

  const goTab = useCallback(
    (next: AdminTab) => {
      setTab(next);
      const q = new URLSearchParams(searchParams.toString());
      q.set('tab', next);
      router.replace(`/admin?${q.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  useEffect(() => {
    if (!loggedIn) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loggedIn]);

  const handleLogout = () => {
    clearAdminToken();
    setLoggedIn(false);
  };

  const currentNav = NAV.find((n) => n.id === tab);

  const panel = checking ? (
    <p className="muted" style={{ fontSize: 13 }}>验证登录…</p>
  ) : !loggedIn ? (
    <div className="settings-card admin-login-card">
      <AdminLoginForm onSuccess={() => setLoggedIn(true)} />
    </div>
  ) : (
    <>
      {tab === 'rag' ? <AdminRagWorkspace /> : null}
      {tab === 'stats' ? <AdminStatsPanel /> : null}
      {tab === 'ops' ? (
        <CampaignAdminGate embedded>
          <CampaignsListPanel embedded />
        </CampaignAdminGate>
      ) : null}
      {tab === 'moderation' ? <AdminModerationPanel /> : null}
    </>
  );

  return (
    <main className="page admin-page admin-console">
      <div className="admin-shell">
        <AdminPcNav
          items={NAV.map((n) => ({
            ...n,
            active: tab === n.id,
            onClick: () => goTab(n.id),
          }))}
          foot={
            <>
              <button type="button" className="admin-pc-nav-ghost" onClick={() => setCmdOpen(true)}>
                <span className="admin-pc-nav-ghost-icon" aria-hidden>
                  ⌕
                </span>
                <span className="admin-pc-nav-ghost-label">搜索 ⌘K</span>
              </button>
              <a className="admin-pc-nav-ghost" href="/profile">
                <span className="admin-pc-nav-ghost-icon" aria-hidden>
                  ←
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
              <PageBackBar href="/profile" label="我的" />
              <span className="page-head-spacer" />
              {loggedIn ? (
                <button type="button" className="text-link" onClick={handleLogout}>
                  退出管理
                </button>
              ) : null}
            </div>
            <div className="admin-page-title-row">
              <h1 className="admin-page-title">管理后台</h1>
              {loggedIn ? (
                <div className="admin-tabs" role="tablist">
                  {NAV.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      role="tab"
                      aria-selected={tab === n.id}
                      className={`admin-tab ${tab === n.id ? 'admin-tab-active' : ''}`}
                      onClick={() => goTab(n.id)}
                    >
                      {n.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <header className="admin-pc-topbar">
            <div>
              <h1 className="admin-pc-title">{currentNav?.label}</h1>
              <p className="muted admin-pc-subtitle">{currentNav?.desc}</p>
            </div>
            {loggedIn ? (
              <button type="button" className="admin-pc-search-btn" onClick={() => setCmdOpen(true)}>
                <span>搜索导航 / 活动 / 文件</span>
                <kbd>⌘K</kbd>
              </button>
            ) : null}
          </header>

          <div className={`admin-shell-content admin-shell-content-${tab}`}>{panel}</div>
        </div>
      </div>

      {loggedIn ? (
        <AdminCommandPalette
          open={cmdOpen}
          onClose={() => setCmdOpen(false)}
          tab={tab}
          onTab={goTab}
        />
      ) : null}
    </main>
  );
}

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <main className="page admin-page">
          <p className="muted" style={{ fontSize: 13 }}>加载中…</p>
        </main>
      }
    >
      <AdminPageInner />
    </Suspense>
  );
}
