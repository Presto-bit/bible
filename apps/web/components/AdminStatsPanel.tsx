'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchAdminStats,
  type AdminStats,
  type AdminStatsDod,
  type AdminStatsSeriesKey,
  type AdminStatsSeriesPoint,
  type AdminStatsTotals,
} from '@/lib/admin_rag';

type MetricDef = {
  key: AdminStatsSeriesKey;
  label: string;
  total: (t: AdminStatsTotals) => number | string;
  hint?: (t: AdminStatsTotals) => string | undefined;
  dodKey: string;
  dodLabel?: string;
  seriesKey?: AdminStatsSeriesKey;
};

const METRICS: MetricDef[] = [
  {
    key: 'uv',
    label: '今日 UV',
    total: (t) => t.uv_today,
    hint: (t) => `游客 ${t.uv_today_guest ?? 0} · 登录 ${t.uv_today_login ?? 0}`,
    dodKey: 'uv_today',
    dodLabel: '较昨日',
    seriesKey: 'uv',
  },
  {
    key: 'users',
    label: '注册用户',
    total: (t) => t.users,
    hint: (t) => `账号 ${t.accounts}`,
    dodKey: 'users_new',
    dodLabel: '今日新增',
    seriesKey: 'users',
  },
  {
    key: 'ai_requests',
    label: '今日 AI',
    total: (t) => t.ai_requests_today,
    hint: (t) => `近 7 日 ${t.ai_requests_7d}`,
    dodKey: 'ai_requests_today',
    dodLabel: '较昨日',
    seriesKey: 'ai_requests',
  },
  {
    key: 'rag_documents',
    label: 'RAG 资料',
    total: (t) => t.rag_documents,
    hint: (t) => `${t.rag_chunks} 块${t.rag_failed ? ` · ${t.rag_failed} 异常` : ''}`,
    dodKey: 'rag_documents_new',
    dodLabel: '今日新增',
    seriesKey: 'rag_documents',
  },
  {
    key: 'groups',
    label: '读经群',
    total: (t) => t.groups,
    hint: (t) => `成员 ${t.group_members}`,
    dodKey: 'groups_new',
    dodLabel: '今日新建',
    seriesKey: 'groups',
  },
  {
    key: 'messages',
    label: '今日群消息',
    total: (t) => t.messages_today,
    hint: (t) => `打卡 ${t.checkins_today}`,
    dodKey: 'messages_today',
    dodLabel: '较昨日',
    seriesKey: 'messages',
  },
  {
    key: 'friendships',
    label: '好友关系',
    total: (t) => t.friendships,
    dodKey: 'friendships_new',
    dodLabel: '今日新增',
    seriesKey: 'friendships',
  },
];

function formatDod(dod: AdminStatsDod | undefined): string | null {
  if (!dod || dod.pct === null) return null;
  const sign = dod.pct > 0 ? '+' : '';
  return `${sign}${dod.pct}%`;
}

function Sparkline({ points, active }: { points: AdminStatsSeriesPoint[]; active?: boolean }) {
  const vals = points.map((p) => p.count);
  if (vals.length < 2) return <div className="admin-dash-spark is-empty" />;
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals, 0);
  const w = 120;
  const h = 36;
  const step = w / (vals.length - 1);
  const coords = vals
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / (max - min || 1)) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg className={`admin-dash-spark ${active ? 'is-active' : ''}`} viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden>
      <polyline fill="none" stroke="currentColor" strokeWidth="2" points={coords} />
    </svg>
  );
}

function TrendChart({
  points,
  label,
}: {
  points: AdminStatsSeriesPoint[];
  label: string;
}) {
  const vals = points.map((p) => p.count);
  const max = Math.max(...vals, 1);
  const w = 640;
  const h = 180;
  const pad = 12;
  if (vals.length < 2) {
    return <p className="muted">暂无趋势数据</p>;
  }
  const step = (w - pad * 2) / (vals.length - 1);
  const line = vals
    .map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - (v / max) * (h - pad * 2);
      return `${x},${y}`;
    })
    .join(' ');
  const area = `${pad},${h - pad} ${line} ${pad + (vals.length - 1) * step},${h - pad}`;

  return (
    <div className="admin-dash-chart">
      <div className="section-row" style={{ marginTop: 0 }}>
        <strong>{label} · 近 7 日</strong>
        <span className="muted" style={{ fontSize: 12 }}>
          峰值 {max}
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="admin-dash-chart-svg" role="img" aria-label={label}>
        <polygon points={area} className="admin-dash-chart-area" />
        <polyline points={line} className="admin-dash-chart-line" fill="none" />
      </svg>
      <div className="admin-dash-chart-axis">
        <span>{points[0]?.date?.slice(5)}</span>
        <span>{points[points.length - 1]?.date?.slice(5)}</span>
      </div>
    </div>
  );
}

export default function AdminStatsPanel() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [focus, setFocus] = useState<AdminStatsSeriesKey>('uv');

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
  const series = stats?.series;

  const focusMetric = METRICS.find((m) => m.key === focus) ?? METRICS[0];
  const focusPoints = series?.[focusMetric.seriesKey || focus] ?? [];

  const alerts = useMemo(() => {
    if (!t) return [] as { label: string; href: string; tone: string }[];
    const list: { label: string; href: string; tone: string }[] = [];
    if (t.rag_failed > 0) {
      list.push({
        label: `RAG 失败 ${t.rag_failed} 条`,
        href: '/admin?tab=rag',
        tone: 'danger',
      });
    }
    if ((t.rag_documents ?? 0) > 0 && (t.rag_chunks ?? 0) === 0) {
      list.push({
        label: '有 RAG 资料但尚无向量块',
        href: '/admin?tab=rag',
        tone: 'warn',
      });
    }
    if ((dod.uv_today?.pct ?? 0) < -20) {
      list.push({
        label: `UV 较昨日 ${formatDod(dod.uv_today)}`,
        href: '/admin/stats/uv',
        tone: 'warn',
      });
    }
    if (t.ai_requests_today === 0) {
      list.push({
        label: '今日尚无 AI 请求',
        href: '/admin/stats/ai_requests',
        tone: 'muted',
      });
    }
    return list;
  }, [t, dod]);

  return (
    <div className="admin-dash">
      <div className="admin-dash-head">
        <div>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            先看健康，再点进明细 · 角标为较昨日环比
          </p>
        </div>
        <button type="button" className="text-link" disabled={loading} onClick={() => void refresh()}>
          刷新
        </button>
      </div>

      {loading && !stats ? <p className="muted" style={{ fontSize: 13 }}>加载中…</p> : null}

      {t ? (
        <>
          <div className="admin-dash-kpi">
            {METRICS.map((m) => {
              const dodText = formatDod(dod[m.dodKey]);
              const dodUp = dod[m.dodKey]?.pct != null && (dod[m.dodKey]?.pct ?? 0) > 0;
              const dodDown = dod[m.dodKey]?.pct != null && (dod[m.dodKey]?.pct ?? 0) < 0;
              const active = focus === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  className={`admin-dash-kpi-card ${active ? 'is-active' : ''}`}
                  onClick={() => setFocus(m.key)}
                >
                  <div className="admin-stat-card-head">
                    <p className="admin-stat-label">{m.label}</p>
                    {dodText ? (
                      <span className={`admin-stat-dod${dodUp ? ' is-up' : ''}${dodDown ? ' is-down' : ''}`}>
                        {dodText}
                      </span>
                    ) : null}
                  </div>
                  <p className="admin-stat-value">{m.total(t)}</p>
                  <Sparkline
                    points={series?.[m.seriesKey || m.key] ?? []}
                    active={active}
                  />
                  {m.hint?.(t) ? <p className="muted admin-stat-hint">{m.hint(t)}</p> : null}
                  <Link
                    href={`/admin/stats/${m.key}`}
                    className="admin-dash-kpi-link"
                    onClick={(e) => e.stopPropagation()}
                  >
                    明细 →
                  </Link>
                </button>
              );
            })}
          </div>

          <div className="admin-dash-main">
            <TrendChart points={focusPoints} label={focusMetric.label} />
            <div className="admin-dash-alerts">
              <strong>关注事项</strong>
              {alerts.length === 0 ? (
                <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>暂无异常，系统看起来健康。</p>
              ) : (
                <ul>
                  {alerts.map((a) => (
                    <li key={a.label}>
                      <Link href={a.href} className={`admin-dash-alert admin-dash-alert-${a.tone}`}>
                        {a.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <div className="admin-dash-quick">
                <Link href="/admin?tab=rag" className="font-pill">
                  打开 RAG
                </Link>
                <Link href="/admin?tab=ops" className="font-pill">
                  打开运营
                </Link>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {err ? (
        <p className="muted" style={{ marginTop: 8, fontSize: 12, color: 'var(--danger, #c45c4a)' }}>{err}</p>
      ) : null}

      {/* 窄屏降级：保留原卡片网格入口 */}
      {t ? (
        <div className="admin-dash-mobile-grid">
          {METRICS.map((m) => (
            <Link key={m.key} href={`/admin/stats/${m.key}`} className="admin-stat-card card card-2">
              <p className="admin-stat-label">{m.label}</p>
              <p className="admin-stat-value">{m.total(t)}</p>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
