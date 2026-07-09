'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  fetchAdminStatsDetail,
  type AdminStatsDetail,
  type AdminStatsSeriesKey,
  type AdminStatsSeriesPoint,
} from '@/lib/admin_rag';

const METRIC_LABELS: Record<AdminStatsSeriesKey, string> = {
  users: '注册用户',
  groups: '读经群',
  friendships: '好友关系',
  messages: '群消息',
  checkins: '打卡',
  uv: '访问 UV',
  ai_requests: 'AI 请求',
  rag_documents: 'RAG 资料',
  group_members: '群成员',
};

const COLUMN_LABELS: Record<string, string> = {
  id: 'ID',
  handle: '用户名',
  display_name: '昵称',
  created_at: '时间',
  has_account: '已绑账号',
  name: '名称',
  join_code: '邀请码',
  members: '成员数',
  user_a: '用户 A',
  user_b: '用户 B',
  group: '群组',
  kind: '类型',
  ref: '经文',
  visitor_key: '访客标识',
  type: '类型',
  user_id: '用户',
  device: '设备',
  request_count: '请求数',
  usage_date: '日期',
  title: '标题',
  source_type: '来源',
  status: '状态',
  indexed_at: '索引时间',
  error: '错误',
  chunks: '向量块',
  logged_in: '已登录',
};

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

function formatCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'string' && value.includes('T')) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString('zh-CN', { hour12: false });
    }
  }
  return String(value);
}

export default function AdminStatsDetailPanel({ metric }: { metric: AdminStatsSeriesKey }) {
  const [detail, setDetail] = useState<AdminStatsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setDetail(await fetchAdminStatsDetail(metric));
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [metric]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const columns = useMemo(() => {
    if (!detail?.items?.length) return [];
    return Object.keys(detail.items[0]);
  }, [detail]);

  const title = detail?.title ?? METRIC_LABELS[metric] ?? metric;

  return (
    <div className="admin-stats-detail">
      <div className="section-row" style={{ marginTop: 0 }}>
        <Link href="/admin?tab=stats" className="text-link">
          ← 数据概览
        </Link>
        <button type="button" className="text-link" disabled={loading} onClick={() => void refresh()}>
          刷新
        </button>
      </div>

      <h2 className="admin-stats-detail-title">{title}</h2>
      {detail?.summary ? <p className="muted admin-stats-detail-summary">{detail.summary}</p> : null}

      {loading && !detail ? <p className="muted" style={{ fontSize: 13 }}>加载中…</p> : null}

      {detail?.series?.length ? (
        <MiniBarChart title={`近 7 日${title}`} points={detail.series} />
      ) : null}

      {detail?.items?.length ? (
        <div className="admin-stats-table-wrap card card-2">
          <p className="settings-title" style={{ margin: '0 0 8px' }}>
            最近 {detail.items.length} 条
          </p>
          <div className="admin-stats-table-scroll">
            <table className="admin-stats-table">
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th key={col}>{COLUMN_LABELS[col] ?? col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detail.items.map((row, i) => (
                  <tr key={i}>
                    {columns.map((col) => (
                      <td key={col}>{formatCell(row[col])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {detail && !detail.items.length && !loading ? (
        <p className="muted" style={{ fontSize: 13 }}>暂无明细数据</p>
      ) : null}

      {err ? (
        <p className="muted" style={{ marginTop: 8, fontSize: 12, color: 'var(--danger, #c45c4a)' }}>{err}</p>
      ) : null}
    </div>
  );
}
