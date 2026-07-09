'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  fetchAdminStats,
  type AdminStats,
  type AdminStatsDod,
  type AdminStatsSeriesKey,
  type AdminStatsTotals,
} from '@/lib/admin_rag';

type MetricDef = {
  key: AdminStatsSeriesKey;
  label: string;
  total: (t: AdminStatsTotals) => number | string;
  hint?: (t: AdminStatsTotals) => string | undefined;
  dodKey: string;
  dodLabel?: string;
};

const METRICS: MetricDef[] = [
  {
    key: 'users',
    label: '注册用户',
    total: (t) => t.users,
    hint: (t) => `账号 ${t.accounts}`,
    dodKey: 'users_new',
    dodLabel: '今日新增',
  },
  {
    key: 'groups',
    label: '读经群',
    total: (t) => t.groups,
    hint: (t) => `成员 ${t.group_members}`,
    dodKey: 'groups_new',
    dodLabel: '今日新建',
  },
  {
    key: 'friendships',
    label: '好友关系',
    total: (t) => t.friendships,
    dodKey: 'friendships_new',
    dodLabel: '今日新增',
  },
  {
    key: 'messages',
    label: '今日群消息',
    total: (t) => t.messages_today,
    hint: (t) => `打卡 ${t.checkins_today}`,
    dodKey: 'messages_today',
    dodLabel: '较昨日',
  },
  {
    key: 'uv',
    label: '今日 UV',
    total: (t) => t.uv_today,
    hint: (t) => `7 日合计 ${t.uv_7d} 人次`,
    dodKey: 'uv_today',
    dodLabel: '较昨日',
  },
  {
    key: 'ai_requests',
    label: '今日 AI 请求',
    total: (t) => t.ai_requests_today,
    hint: (t) => `近 7 日 ${t.ai_requests_7d}`,
    dodKey: 'ai_requests_today',
    dodLabel: '较昨日',
  },
  {
    key: 'rag_documents',
    label: 'RAG 资料',
    total: (t) => t.rag_documents,
    hint: (t) => `${t.rag_chunks} 向量块${t.rag_failed ? ` · ${t.rag_failed} 异常` : ''}`,
    dodKey: 'rag_documents_new',
    dodLabel: '今日新增',
  },
];

function formatDod(dod: AdminStatsDod | undefined): string | null {
  if (!dod || dod.pct === null) return null;
  const sign = dod.pct > 0 ? '+' : '';
  return `${sign}${dod.pct}%`;
}

function StatCard({
  href,
  label,
  value,
  hint,
  dod,
  dodLabel,
}: {
  href: string;
  label: string;
  value: number | string;
  hint?: string;
  dod?: AdminStatsDod;
  dodLabel?: string;
}) {
  const dodText = formatDod(dod);
  const dodUp = dod?.pct !== null && dod?.pct !== undefined && dod.pct > 0;
  const dodDown = dod?.pct !== null && dod?.pct !== undefined && dod.pct < 0;

  return (
    <Link href={href} className="admin-stat-card card card-2">
      <div className="admin-stat-card-head">
        <p className="admin-stat-label">{label}</p>
        {dodText ? (
          <span
            className={`admin-stat-dod${dodUp ? ' is-up' : ''}${dodDown ? ' is-down' : ''}`}
            title={dodLabel ? `${dodLabel} ${dod?.today ?? 0}（昨日 ${dod?.yesterday ?? 0}）` : undefined}
          >
            {dodText}
          </span>
        ) : null}
      </div>
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
      setStats(await fetchAdminStats(7));
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
  const dod = stats?.dod ?? {};

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
          <p className="muted admin-stat-tip">点击卡片查看趋势与明细 · 角标为较昨日环比</p>
          <div className="admin-stat-grid">
            {METRICS.map((m) => (
              <StatCard
                key={m.key}
                href={`/admin/stats/${m.key}`}
                label={m.label}
                value={m.total(t)}
                hint={m.hint?.(t)}
                dod={dod[m.dodKey]}
                dodLabel={m.dodLabel}
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
