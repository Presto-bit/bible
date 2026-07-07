'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchAdminStats,
  type AdminStats,
  type AdminStatsSeriesKey,
  type AdminStatsSeriesPoint,
  type AdminStatsTotals,
} from '@/lib/admin_rag';

type MetricDef = {
  key: AdminStatsSeriesKey;
  label: string;
  total: (t: AdminStatsTotals) => number | string;
  hint?: (t: AdminStatsTotals) => string | undefined;
  chartTitle: string;
};

const METRICS: MetricDef[] = [
  {
    key: 'users',
    label: '注册用户',
    total: (t) => t.users,
    hint: (t) => `账号 ${t.accounts}`,
    chartTitle: '近 7 日新增用户',
  },
  {
    key: 'groups',
    label: '读经群',
    total: (t) => t.groups,
    hint: (t) => `成员 ${t.group_members}`,
    chartTitle: '近 7 日新建群',
  },
  {
    key: 'friendships',
    label: '好友关系',
    total: (t) => t.friendships,
    chartTitle: '近 7 日新增好友',
  },
  {
    key: 'messages',
    label: '今日群消息',
    total: (t) => t.messages_today,
    hint: (t) => `打卡 ${t.checkins_today}`,
    chartTitle: '近 7 日群消息',
  },
  {
    key: 'uv',
    label: '今日 UV',
    total: (t) => t.uv_today,
    hint: (t) => `登录按用户 ID、游客按设备去重 · 7 日合计 ${t.uv_7d} 人次`,
    chartTitle: '近 7 日 UV',
  },
  {
    key: 'ai_requests',
    label: '今日 AI 请求',
    total: (t) => t.ai_requests_today,
    hint: (t) => `近 7 日 ${t.ai_requests_7d}`,
    chartTitle: '近 7 日 AI 请求',
  },
  {
    key: 'rag_documents',
    label: 'RAG 资料',
    total: (t) => t.rag_documents,
    hint: (t) => `${t.rag_chunks} 向量块${t.rag_failed ? ` · ${t.rag_failed} 异常` : ''}`,
    chartTitle: '近 7 日新增资料',
  },
];

function StatCard({
  label,
  value,
  hint,
  active,
  onClick,
}: {
  label: string;
  value: number | string;
  hint?: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`admin-stat-card card card-2${active ? ' is-active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <p className="admin-stat-label">{label}</p>
      <p className="admin-stat-value">{value}</p>
      {hint ? <p className="muted admin-stat-hint">{hint}</p> : null}
    </button>
  );
}

function MiniBarChart({ title, points }: { title: string; points: AdminStatsSeriesPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.count));
  const total = points.reduce((sum, p) => sum + p.count, 0);
  return (
    <div className="admin-chart card card-2">
      <div className="admin-chart-head">
        <p className="settings-title" style={{ margin: 0 }}>{title}</p>
        <span className="muted" style={{ fontSize: 12 }}>7 日合计 {total}</span>
      </div>
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
  const [selectedKey, setSelectedKey] = useState<AdminStatsSeriesKey>('ai_requests');

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

  const selectedMetric = useMemo(
    () => METRICS.find((m) => m.key === selectedKey) ?? METRICS[0],
    [selectedKey],
  );

  const t = stats?.totals;
  const trendPoints = stats?.series?.[selectedKey] ?? [];

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
          <p className="muted admin-stat-tip">点击卡片查看近 7 日趋势</p>
          <div className="admin-stat-grid">
            {METRICS.map((m) => (
              <StatCard
                key={m.key}
                label={m.label}
                value={m.total(t)}
                hint={m.hint?.(t)}
                active={selectedKey === m.key}
                onClick={() => setSelectedKey(m.key)}
              />
            ))}
          </div>

          {selectedMetric && trendPoints.length > 0 ? (
            <div className="admin-chart-grid">
              <MiniBarChart title={selectedMetric.chartTitle} points={trendPoints} />
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
