'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminJson } from '@/lib/admin_rag';

type OutreachJob = {
  id: string;
  kind: string;
  title?: string | null;
  audience: string;
  status: string;
  total_targets: number;
  sent_count: number;
  skipped_count?: number;
  failed_count?: number;
  created_at?: string | null;
  sent_at?: string | null;
};

type FeedbackItem = {
  id: string;
  user_code?: string | null;
  category: string;
  scene?: string | null;
  body: string;
  created_at?: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  queued: '排队中',
  sending: '发送中',
  done: '已完成',
  failed: '失败',
};

const AUDIENCE_LABEL: Record<string, string> = {
  all: '全部用户',
  active_30d: '近 30 天活跃',
};

const FEEDBACK_CATEGORY_LABEL: Record<string, string> = {
  bug: '使用中问题',
  idea: '功能建议',
  content: '内容或书籍',
  ai: '小爱回答',
  other: '其他',
};

function formatAdminTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = iso.slice(0, 16).replace('T', ' ');
  return d;
}

function jobProgress(j: OutreachJob): number {
  const total = j.total_targets || 0;
  if (total <= 0) return 0;
  const done =
    (j.sent_count ?? 0) + (j.skipped_count ?? 0) + (j.failed_count ?? 0);
  return Math.min(100, Math.round((done / total) * 100));
}

function statusTone(status: string): string {
  if (status === 'done') return 'is-done';
  if (status === 'failed') return 'is-failed';
  if (status === 'sending' || status === 'queued') return 'is-active';
  return 'is-idle';
}

export default function AdminOutreachPanel() {
  const [jobs, setJobs] = useState<OutreachJob[]>([]);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [maxPerMonth, setMaxPerMonth] = useState(2);
  const [sentThisMonth, setSentThisMonth] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<'all' | 'active_30d'>('all');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [welcomePreview, setWelcomePreview] = useState<string>('');

  const loadJobs = useCallback(async () => {
    const j = await adminJson<{
      jobs: OutreachJob[];
      broadcast_max_per_month: number;
      broadcast_sent_this_month?: number;
    }>('/admin/outreach/jobs');
    setJobs(j.jobs || []);
    setMaxPerMonth(j.broadcast_max_per_month ?? 2);
    setSentThisMonth(j.broadcast_sent_this_month ?? 0);
  }, []);

  const loadStatic = useCallback(async () => {
    const f = await adminJson<{ items: FeedbackItem[] }>('/admin/outreach/feedback');
    setFeedback(f.items || []);
    const w = await adminJson<{ body: string }>('/admin/outreach/preview-welcome', {
      method: 'POST',
    });
    setWelcomePreview(w.body || '');
  }, []);

  const reloadAll = useCallback(async () => {
    try {
      await Promise.all([loadJobs(), loadStatic()]);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败');
    }
  }, [loadJobs, loadStatic]);

  useEffect(() => {
    void reloadAll();
  }, [reloadAll]);

  useEffect(() => {
    const active = jobs.some((j) => j.status === 'queued' || j.status === 'sending');
    if (!active) return;
    const t = window.setInterval(() => {
      void loadJobs().catch(() => {
        /* 轮询失败不打断当前列表 */
      });
    }, 2500);
    return () => window.clearInterval(t);
  }, [jobs, loadJobs]);

  const createAndSend = async () => {
    if (busy || !title.trim() || !body.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const created = await adminJson<{ id: string }>('/admin/outreach/broadcast', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          audience,
          actions: [{ label: '产品说明', href: '/help/product' }],
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      await adminJson<{ status: string; total_targets?: number }>(
        `/admin/outreach/broadcast/${created.id}/send`,
        { method: 'POST' },
      );
      setTitle('');
      setBody('');
      await loadJobs();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '发送失败');
    } finally {
      setBusy(false);
    }
  };

  const quotaLeft = Math.max(0, maxPerMonth - sentThisMonth);

  return (
    <div className="admin-outreach-panel">
      <p className="muted admin-outreach-lead">
        欢迎信在注册或首次打开官方会话时自动发送（welcome_v2）。全员信本月已完成{' '}
        <strong>{sentThisMonth}</strong> / {maxPerMonth} 次
        {quotaLeft === 0 ? (
          <span className="admin-outreach-quota-warn"> · 本月额度已用尽</span>
        ) : (
          <span> · 还可发送 {quotaLeft} 次</span>
        )}
        。
      </p>
      {err ? <p className="error-text">{err}</p> : null}

      <div className="settings-card admin-outreach-card">
        <p className="settings-title">欢迎信预览</p>
        <p className="admin-outreach-welcome-body">{welcomePreview || '加载中…'}</p>
      </div>

      <div className="settings-card admin-outreach-card">
        <p className="settings-title">新建全员信（notice）</p>
        <input
          className="input"
          placeholder="标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="input"
          rows={4}
          style={{ marginTop: 8 }}
          placeholder="正文"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <select
          className="input"
          style={{ marginTop: 8 }}
          value={audience}
          onChange={(e) => setAudience(e.target.value as 'all' | 'active_30d')}
        >
          <option value="all">全部用户</option>
          <option value="active_30d">近 30 天活跃</option>
        </select>
        <button
          type="button"
          className="btn"
          style={{ marginTop: 12 }}
          disabled={busy || quotaLeft === 0}
          onClick={() => void createAndSend()}
        >
          {busy ? '提交中…' : quotaLeft === 0 ? '本月已达发送上限' : '创建并入队发送'}
        </button>
      </div>

      <div className="settings-card admin-outreach-card">
        <p className="settings-title">近期全员信</p>
        {jobs.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            暂无任务
          </p>
        ) : (
          <ul className="admin-outreach-job-list">
            {jobs.map((j) => {
              const inFlight = j.status === 'queued' || j.status === 'sending';
              const pct = jobProgress(j);
              return (
                <li key={j.id} className="admin-outreach-job">
                  <div className="admin-outreach-job-head">
                    <strong className="admin-outreach-job-title">{j.title || '（无标题）'}</strong>
                    <span className={`admin-outreach-status ${statusTone(j.status)}`}>
                      {STATUS_LABEL[j.status] || j.status}
                    </span>
                  </div>
                  <p className="muted admin-outreach-job-meta">
                    {AUDIENCE_LABEL[j.audience] || j.audience}
                    {' · '}
                    创建 {formatAdminTime(j.created_at)}
                    {j.sent_at ? ` · 完成 ${formatAdminTime(j.sent_at)}` : ''}
                  </p>
                  <p className="admin-outreach-job-stats">
                    成功 {j.sent_count ?? 0}
                    {typeof j.skipped_count === 'number' ? ` · 跳过 ${j.skipped_count}` : ''}
                    {typeof j.failed_count === 'number' && j.failed_count > 0
                      ? ` · 失败 ${j.failed_count}`
                      : ''}
                    {j.total_targets > 0 ? ` · 目标 ${j.total_targets}` : ''}
                  </p>
                  {inFlight && j.total_targets > 0 ? (
                    <div
                      className="admin-outreach-progress"
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="admin-outreach-progress-bar"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="settings-card admin-outreach-card">
        <p className="settings-title">用户反馈（最新）</p>
        {feedback.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            暂无反馈
          </p>
        ) : (
          <ul className="admin-outreach-feedback-list">
            {feedback.map((f) => (
              <li key={f.id} className="admin-outreach-feedback">
                <div className="admin-outreach-feedback-head">
                  <span className="admin-outreach-feedback-cat">
                    {FEEDBACK_CATEGORY_LABEL[f.category] || f.category}
                  </span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {formatAdminTime(f.created_at)}
                  </span>
                </div>
                <p className="muted admin-outreach-feedback-meta">
                  {f.scene ? `${f.scene}` : '场景未填'}
                  {f.user_code ? ` · ID ${f.user_code}` : ''}
                </p>
                <p className="admin-outreach-feedback-body">{f.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
