'use client';

import { useState } from 'react';
import PageBackBar from '@/components/PageBackBar';
import { api, ensureAccountReady } from '@/lib/api';
import { markRouteNavigation } from '@/lib/pwa_tab_nav';
import {
  PROFILE_SETTINGS_BACK_LABEL,
  PROFILE_SETTINGS_HREF,
} from '@/lib/profile_settings';
import { OFFICIAL_SUPPORT_USER_CODE } from '@/lib/official_support';
import { useRouter } from 'next/navigation';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';

const CATEGORIES: { id: string; label: string }[] = [
  { id: 'bug', label: '使用中问题' },
  { id: 'idea', label: '功能建议' },
  { id: 'content', label: '内容或书籍' },
  { id: 'ai', label: '小爱回答' },
  { id: 'other', label: '其他' },
];

const SCENES = ['首页', '圣经', '小爱', '发现', '我的', '其他'];

export default function HelpFeedbackFormPage() {
  useEdgeSwipeBack({ href: PROFILE_SETTINGS_HREF });
  const router = useRouter();
  const [category, setCategory] = useState('bug');
  const [scene, setScene] = useState('其他');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (busy || !body.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await ensureAccountReady();
      const res = await api.submitFeedback({
        category,
        scene: scene === '其他' ? undefined : scene,
        body: body.trim(),
      });
      setDone(res.id);
      setBody('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '提交失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  const openOfficialDm = async () => {
    setBusy(true);
    try {
      await ensureAccountReady();
      const dm = await api.openDm(OFFICIAL_SUPPORT_USER_CODE);
      markRouteNavigation();
      router.push(`/discover/dm/${dm.thread_id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '暂时无法打开会话');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="container">
      <header className="page-head">
        <PageBackBar
          href={PROFILE_SETTINGS_HREF}
          label={PROFILE_SETTINGS_BACK_LABEL}
          onClick={() => markRouteNavigation()}
        />
        <h2 className="page-head-title">帮助与反馈</h2>
      </header>

      <p className="muted product-guide-intro">
        先说清楚问题或想法，我们会按类型整理；也可以直接和彼爱团队私信聊。
      </p>

      {done ? (
        <div className="settings-card" style={{ marginTop: 12 }}>
          <p className="settings-title">已收到，谢谢你</p>
          <p className="muted product-guide-p">编号 {done.slice(0, 8)}… 我们可能会通过官方会话回复你。</p>
          <button type="button" className="btn" onClick={() => void openOfficialDm()} disabled={busy}>
            去彼爱团队会话
          </button>
        </div>
      ) : (
        <div className="settings-card" style={{ marginTop: 12 }}>
          <label className="settings-title">类型</label>
          <FeedbackCategoryRow category={category} setCategory={setCategory} />
          <label className="settings-title" style={{ marginTop: 12 }}>
            场景
          </label>
          <select
            className="input"
            value={scene}
            onChange={(e) => setScene(e.target.value)}
          >
            {SCENES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <label className="settings-title" style={{ marginTop: 12 }}>
            描述
          </label>
          <textarea
            className="input"
            rows={5}
            value={body}
            placeholder="尽量说清楚发生了什么、你期望怎样"
            onChange={(e) => setBody(e.target.value)}
          />
          {err ? <p className="error-text">{err}</p> : null}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button type="button" className="btn" disabled={busy || !body.trim()} onClick={() => void submit()}>
              {busy ? '提交中…' : '提交反馈'}
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void openOfficialDm()}>
              改去私信
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function FeedbackCategoryRow({
  category,
  setCategory,
}: {
  category: string;
  setCategory: (v: string) => void;
}) {
  return (
    <div className="feedback-category-row">
      {CATEGORIES.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`chip${category === c.id ? ' is-active' : ''}`}
          onClick={() => setCategory(c.id)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
