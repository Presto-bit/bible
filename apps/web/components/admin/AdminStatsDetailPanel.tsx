'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  fetchAdminStatsDetail,
  type AdminStatsDetail,
  type AdminStatsRangePreset,
  type AdminStatsSection,
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

const RAG_COLUMNS: Record<string, string> = {
  title: '标题',
  source_type: '来源',
  status: '状态',
  chunks: '向量块',
  indexed_at: '索引时间',
  error: '错误',
  created_at: '创建时间',
};

type RangeOption = { preset: AdminStatsRangePreset; label: string };

const RANGE_OPTIONS: RangeOption[] = [
  { preset: 'today', label: '今日' },
  { preset: '7d', label: '7 日' },
  { preset: '30d', label: '30 日' },
];

function MiniBarChart({
  title,
  points,
  rangeLabel,
}: {
  title: string;
  points: AdminStatsSeriesPoint[];
  rangeLabel?: string;
}) {
  const max = Math.max(1, ...points.map((p) => p.count));
  const total = points.reduce((sum, p) => sum + p.count, 0);
  const dense = points.length > 14;
  return (
    <div className="admin-chart card card-2">
      <div className="admin-chart-head">
        <p className="settings-title" style={{ margin: 0 }}>{title}</p>
        <span className="muted" style={{ fontSize: 12 }}>
          {rangeLabel ? `${rangeLabel} · ` : ''}合计 {total}
        </span>
      </div>
      <div className={`admin-chart-bars${dense ? ' is-dense' : ''}`} role="img" aria-label={title}>
        {points.map((p) => {
          const pct = Math.round((p.count / max) * 100);
          const label = dense ? p.date.slice(8) : p.date.slice(5);
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

function StatsTable({ section }: { section: AdminStatsSection }) {
  if (!section.items.length) return null;
  return (
    <div className="admin-stats-table-wrap card card-2">
      <p className="settings-title" style={{ margin: '0 0 8px' }}>{section.title}</p>
      <div className="admin-stats-table-scroll">
        <table className="admin-stats-table">
          <thead>
            <tr>
              {section.columns.map((col) => (
                <th key={col.key}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.items.map((row, i) => (
              <tr key={i}>
                {section.columns.map((col) => (
                  <td key={col.key}>{formatCell(row[col.key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminStatsDetailPanel({ metric }: { metric: AdminStatsSeriesKey }) {
  const isRag = metric === 'rag_documents';
  const [preset, setPreset] = useState<AdminStatsRangePreset>('7d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [detail, setDetail] = useState<AdminStatsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const opts: Parameters<typeof fetchAdminStatsDetail>[1] = { limit: 50 };
      if (!isRag) {
        if (preset === 'custom') {
          if (!customFrom || !customTo) {
            setErr('请选择自定义起止日期');
            setLoading(false);
            return;
          }
          opts.preset = 'custom';
          opts.dateFrom = customFrom;
          opts.dateTo = customTo;
        } else {
          opts.preset = preset;
        }
      }
      setDetail(await fetchAdminStatsDetail(metric, opts));
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [metric, preset, customFrom, customTo, isRag]);

  useEffect(() => {
    void load();
  }, [load]);

  const title = detail?.title ?? METRIC_LABELS[metric] ?? metric;

  const rangeLabel = useMemo(() => {
    if (!detail?.range) return undefined;
    const map: Record<string, string> = { today: '今日', '7d': '近 7 日', '30d': '近 30 日', custom: '自定义' };
    return map[detail.range.preset] ?? `${detail.range.from} ~ ${detail.range.to}`;
  }, [detail?.range]);

  const ragColumns = useMemo(() => {
    if (!isRag || !detail?.items?.length) return [];
    return Object.keys(detail.items[0]).filter((k) => k !== 'id');
  }, [isRag, detail?.items]);

  return (
    <div className="admin-stats-detail">
      <div className="section-row" style={{ marginTop: 0 }}>
        <Link href="/admin?tab=stats" className="text-link">
          ← 数据概览
        </Link>
        <button type="button" className="text-link" disabled={loading} onClick={() => void load()}>
          刷新
        </button>
      </div>

      <h2 className="admin-stats-detail-title">{title}</h2>
      {detail?.summary ? <p className="muted admin-stats-detail-summary">{detail.summary}</p> : null}

      {!isRag ? (
        <div className="admin-stats-range card card-2">
          <div className="admin-stats-range-presets">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.preset}
                type="button"
                className={`admin-stats-range-btn${preset === opt.preset ? ' is-active' : ''}`}
                onClick={() => setPreset(opt.preset)}
              >
                {opt.label}
              </button>
            ))}
            <button
              type="button"
              className={`admin-stats-range-btn${preset === 'custom' ? ' is-active' : ''}`}
              onClick={() => setPreset('custom')}
            >
              自定义
            </button>
          </div>
          {preset === 'custom' ? (
            <div className="admin-stats-range-custom">
              <label className="admin-stats-range-field">
                <span className="muted">开始</span>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </label>
              <label className="admin-stats-range-field">
                <span className="muted">结束</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </label>
              <button type="button" className="text-link" onClick={() => void load()}>
                应用
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {loading && !detail ? <p className="muted" style={{ fontSize: 13 }}>加载中…</p> : null}

      {detail?.insights?.length ? (
        <div className="admin-insight-grid">
          {detail.insights.map((ins) => (
            <div key={ins.label} className="admin-insight-card card card-2">
              <p className="admin-insight-label">{ins.label}</p>
              <p className="admin-insight-value">{ins.value}</p>
              {ins.hint ? <p className="muted admin-insight-hint">{ins.hint}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      {detail?.series?.length ? (
        <MiniBarChart title={`${title}趋势`} points={detail.series} rangeLabel={rangeLabel} />
      ) : null}

      {detail?.sections?.map((section) => (
        <StatsTable key={section.key} section={section} />
      ))}

      {isRag && detail?.items?.length ? (
        <div className="admin-stats-table-wrap card card-2">
          <p className="settings-title" style={{ margin: '0 0 8px' }}>资料列表</p>
          <div className="admin-stats-table-scroll">
            <table className="admin-stats-table">
              <thead>
                <tr>
                  {ragColumns.map((col) => (
                    <th key={col}>{RAG_COLUMNS[col] ?? col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detail.items.map((row, i) => (
                  <tr key={i}>
                    {ragColumns.map((col) => (
                      <td key={col}>{formatCell(row[col])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {detail && !detail.sections?.length && !detail.items?.length && !loading ? (
        <p className="muted" style={{ fontSize: 13 }}>暂无明细数据</p>
      ) : null}

      {err ? (
        <p className="muted" style={{ marginTop: 8, fontSize: 12, color: 'var(--danger, #c45c4a)' }}>{err}</p>
      ) : null}
    </div>
  );
}
