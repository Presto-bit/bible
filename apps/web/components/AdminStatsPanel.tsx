'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  fetchAdminStats,
  type AdminStats,
  type AdminStatsSeriesKey,
  type AdminStatsTotals,
} from '@/lib/admin_rag';

type MetricDef = {
  key: AdminStatsSeriesKey;
  label: string;
  total: (t: AdminStatsTotals) => number | string;
  hint?: (t: AdminStatsTotals) => string | undefined;
};

const METRICS: MetricDef[] = [
  {
    key: 'users',
    label: '注册用户',
    total: (t) => t.users,
    hint: (t) => `账号 ${t.accounts}`,
  },
  {
    key: 'groups',
    label: '读经群',
    total: (t) => t.groups,
    hint: (t) => `成员 ${t.group_members}`,
  },
  {
    key: 'friendships',
    label: '好友关系',
    total: (t) => t.friendships,
  },
  {
    key: 'messages',
    label: '今日群消息',
    total: (t) => t.messages_today,
    hint: (t) => `打卡 ${t.checkins_today}`,
  },
  {
    key: 'uv',
    label: '今日 UV',
    total: (t) => t.uv_today,
    hint: (t) => `登录按用户 ID、游客按设备去重 · 7 日合计 ${t.uv_7d} 人次`,
  },
  {
    key: 'ai_requests',
    label: '今日 AI 请求',
    total: (t) => t.ai_requests_today,
    hint: (t) => `近 7 日 ${t.ai_requests_7d}`,
  },
  {
    key: 'rag_documents',
    label: 'RAG 资料',
    total: (t) => t.rag_documents,
    hint: (t) => `${t.rag_chunks} 向量块${t.rag_failed ? ` · ${t.rag_failed} 异常` : ''}`,
  },
];

function StatCard({
  href,
  label,
  value,
  hint,
}: {
  href: string;
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <Link href={href} className="admin-stat-card card card-2">
      <p className="admin-stat-label">{label}</p>
      <p className="admin-stat-value">{value}</p>
      {hint ? <p className="muted admin-stat-hint">{hint}</p> : null}
    </Link>
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
          <p className="muted admin-stat-tip">点击卡片查看近 7 日趋势与明细</p>
          <div className="admin-stat-grid">
            {METRICS.map((m) => (
              <StatCard
                key={m.key}
                href={`/admin/stats/${m.key}`}
                label={m.label}
                value={m.total(t)}
                hint={m.hint?.(t)}
              />
            ))}
          </div>
        </>
      ) : null}

      {err ? (
        <p className="muted" style={{ marginTop: 8, fontSize: 12, color: 'var(--danger, #c45c4a)' }}>{err}</p>
      ) : null}
    </div>
  );
}
