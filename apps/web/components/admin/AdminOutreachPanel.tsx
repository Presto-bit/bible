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

export default function AdminOutreachPanel() {
  const [jobs, setJobs] = useState<OutreachJob[]>([]);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [maxPerMonth, setMaxPerMonth] = useState(2);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<'all' | 'active_30d'>('all');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [welcomePreview, setWelcomePreview] = useState<string>('');

  const reload = useCallback(async () => {
    try {
      const j = await adminJson<{ jobs: OutreachJob[]; broadcast_max_per_month: number }>(
        '/admin/outreach/jobs',
      );
      setJobs(j.jobs || []);
      setMaxPerMonth(j.broadcast_max_per_month ?? 2);
      const f = await adminJson<{ items: FeedbackItem[] }>('/admin/outreach/feedback');
      setFeedback(f.items || []);
      const w = await adminJson<{ body: string }>('/admin/outreach/preview-welcome', {
        method: 'POST',
      });
      setWelcomePreview(w.body || '');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const active = jobs.some((j) => j.status === 'queued' || j.status === 'sending');
    if (!active) return;
    const t = window.setInterval(() => {
      void reload();
    }, 2500);
    return () => window.clearInterval(t);
  }, [jobs, reload]);

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
      const queued = await adminJson<{ status: string; total_targets?: number }>(
        `/admin/outreach/broadcast/${created.id}/send`,
        { method: 'POST' },
      );
      setTitle('');
      setBody('');
      await reload();
      if (queued.status === 'queued') {
        setErr(null);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '发送失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-outreach-panel">
      <h3 className="settings-title">用户触达</h3>
      <p className="muted product-guide-p">
        全员信每月最多 {maxPerMonth} 次；欢迎信在注册或首次打开官方会话时发送（welcome_v2）。
      </p>
      {err ? <p className="error-text">{err}</p> : null}

      <div className="settings-card">
        <p className="settings-title">欢迎信预览</p>
        <p className="muted product-guide-p">{welcomePreview}</p>
      </div>

      <div className="settings-card" style={{ marginTop: 12 }}>
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
          disabled={busy}
          onClick={() => void createAndSend()}
        >
          {busy ? '提交中…' : '创建并入队发送'}
        </button>
      </div>

      <div className="settings-card" style={{ marginTop: 12 }}>
        <p className="settings-title">近期任务</p>
        <ul className="product-guide-ul">
          {jobs.map((j) => (
            <li key={j.id}>
              {j.title || j.kind} · {j.audience} · {j.status} · 成功 {j.sent_count} / 共{' '}
              {j.total_targets}
              {j.skipped_count ? ` · 跳过 ${j.skipped_count}` : ''}
              {j.failed_count ? ` · 失败 ${j.failed_count}` : ''}
            </li>
          ))}
        </ul>
      </div>

      <div className="settings-card" style={{ marginTop: 12 }}>
        <p className="settings-title">用户反馈（最新）</p>
        <ul className="product-guide-ul">
          {feedback.map((f) => (
            <li key={f.id}>
              [{f.category}] {f.scene ? `${f.scene} · ` : ''}
              {f.user_code ? `ID ${f.user_code} · ` : ''}
              {f.body.slice(0, 80)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
