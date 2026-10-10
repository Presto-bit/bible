'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchDailyVerseWarmStatus,
  patchDailyVerseWarmSettings,
  runDailyVerseWarmTick,
  type DailyVerseWarmStatus,
} from '@/lib/admin_daily_verse_warm';

export default function AdminDailyVerseWarmPanel() {
  const [data, setData] = useState<DailyVerseWarmStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setData(await fetchDailyVerseWarmStatus());
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onToggle = async () => {
    if (!data) return;
    setSaving(true);
    setErr(null);
    try {
      const next = !data.settings.enabled;
      const res = await patchDailyVerseWarmSettings({ enabled: next });
      setData(res);
      flash(next ? '暖场已开启' : '暖场已关闭');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const onRunOnce = async () => {
    setRunning(true);
    setErr(null);
    try {
      const res = await runDailyVerseWarmTick();
      setData(res);
      const skipped = res.tick?.skipped;
      if (skipped === 'disabled') {
        flash('请先打开暖场开关');
        return;
      }
      const added = (res.tick?.personas_added as number) ?? 0;
      if (skipped === 'caught_up') {
        flash('当前进度已跟上，无需写入');
        return;
      }
      flash(added > 0 ? `已写入 ${added} 人互动` : '本次未新增互动');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '执行失败');
    } finally {
      setRunning(false);
    }
  };

  const s = data?.settings;
  const t = data?.today;

  return (
    <section className="settings-card admin-warm-panel" style={{ marginBottom: 16 }}>
      <div className="admin-warm-head">
        <div>
          <h2 className="admin-section-title" style={{ margin: 0 }}>
            每日经文暖场
          </h2>
          <p className="muted" style={{ fontSize: 13, marginTop: 6, marginBottom: 0 }}>
            8800xxxx 专用账号补互动缺口，不计入数据统计。关闭后立即停止新写入。
          </p>
        </div>
        <label className="admin-warm-switch">
          <input
            type="checkbox"
            checked={Boolean(s?.enabled)}
            disabled={loading || saving || !s}
            onChange={() => void onToggle()}
          />
          <span>{s?.enabled ? '已开启' : '已关闭'}</span>
        </label>
      </div>

      {err ? (
        <p className="form-error" style={{ marginTop: 12 }}>
          {err}
        </p>
      ) : null}
      {toast ? (
        <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
          {toast}
        </p>
      ) : null}

      {loading ? (
        <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
          加载中…
        </p>
      ) : t && s ? (
        <div className="admin-warm-stats" style={{ marginTop: 14 }}>
          <div className="admin-warm-stat">
            <span className="muted">今日目标上限</span>
            <strong>{t.cap}</strong>
          </div>
          <div className="admin-warm-stat">
            <span className="muted">真实互动</span>
            <strong>{t.real_u}</strong>
          </div>
          <div className="admin-warm-stat">
            <span className="muted">暖场互动</span>
            <strong>{t.synthetic_u}</strong>
          </div>
          <div className="admin-warm-stat">
            <span className="muted">合计</span>
            <strong>{t.total_u}</strong>
          </div>
          <div className="admin-warm-stat">
            <span className="muted">日进度</span>
            <strong>{Math.round(t.day_progress * 100)}%</strong>
          </div>
        </div>
      ) : null}

      <p className="muted" style={{ fontSize: 12, marginTop: 12, lineHeight: 1.5 }}>
        爬坡自 {s?.t0 || '—'} 起约 {s?.ramp_days ?? 50} 天，从 {s?.cap_min ?? 10} 人升至{' '}
        {s?.cap_max ?? 100} 人。定时任务请配置{' '}
        <code style={{ fontSize: 11 }}>POST /content/cron/daily-verse-warm</code>（与推送 cron
        同密钥），建议 6:00–23:00 每 30 分钟一次。
      </p>

      <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn secondary"
          disabled={running || loading || !s?.enabled}
          onClick={() => void onRunOnce()}
        >
          {running ? '执行中…' : '立即跑一波'}
        </button>
        <button type="button" className="btn ghost" disabled={loading} onClick={() => void load()}>
          刷新
        </button>
      </div>
    </section>
  );
}
