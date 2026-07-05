'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchAdminStats, type AdminStats, type AdminStatsSeriesPoint } from '@/lib/admin_rag';

function StatCard({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="admin-stat-card card card-2">
      <p className="admin-stat-label">{label}</p>
      <p className="admin-stat-value">{value}</p>
      {hint ? <p className="muted admin-stat-hint">{hint}</p> : null}
    </div>
  );
}

function MiniBarChart({ title, points }: { title: string; points: AdminStatsSeriesPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.count));
  return (
    <div className="admin-chart card card-2">
      <p className="settings-title" style={{ marginTop: 0 }}>{title}</p>
      <div className="admin-chart-bars" role="img" aria-label={title}>
        {points.map((p) => {
          const pct = Math.round((p.count / max) * 100);
          const label = p.date.slice(5);
          return (
            <div key={p.date} className="admin-chart-bar-wrap">
              <div className="admin-chart-bar" style={{ height: `${Math.max(pct, p.count > 0 ? 8 : 2)}%` }} />
              <span className="admin-chart-count">{p.count || ''}</span>
              <span className="admin-chart-date">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminStatsPanel() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setStats(await fetchAdminStats());
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const t = stats?.totals;

  return (
    <div className="admin-stats-panel">
      <div className="section-row" style={{ marginTop: 0 }}>
        <p className="settings-title" style={{ margin: 0 }}>数据概览</p>
        <button type="button" className="text-link" disabled={loading} onClick={() => void refresh()}>
          刷新
        </button>
      </div>

      {loading && !stats ? <p className="muted" style={{ fontSize: 13 }}>加载中…</p> : null}

      {t ? (
        <>
          <div className="admin-stat-grid">
            <StatCard label="注册用户" value={t.users} hint={`账号 ${t.accounts}`} />
            <StatCard label="读经群" value={t.groups} hint={`成员 ${t.group_members}`} />
            <StatCard label="好友关系" value={t.friendships} />
            <StatCard label="今日群消息" value={t.messages_today} hint={`打卡 ${t.checkins_today}`} />
            <StatCard label="今日 AI 请求" value={t.ai_requests_today} hint={`近 7 日 ${t.ai_requests_7d}`} />
            <StatCard
              label="RAG 资料"
              value={t.rag_documents}
              hint={`${t.rag_chunks} 向量块${t.rag_failed ? ` · ${t.rag_failed} 异常` : ''}`}
            />
          </div>

          {stats.series ? (
            <div className="admin-chart-grid">
              <MiniBarChart title="近 7 日 AI 请求" points={stats.series.ai_requests} />
              <MiniBarChart title="近 7 日群打卡" points={stats.series.checkins} />
            </div>
          ) : null}
        </>
      ) : null}

      {err ? (
        <p className="muted" style={{ marginTop: 8, fontSize: 12, color: 'var(--danger, #c45c4a)' }}>{err}</p>
      ) : null}
    </div>
  );
}
