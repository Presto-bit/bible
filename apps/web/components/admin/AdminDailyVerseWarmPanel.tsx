'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchDailyVerseWarmStatus,
  patchDailyVerseWarmSettings,
  runDailyVerseWarmTick,
  type DailyVerseWarmSettings,
  type DailyVerseWarmStatus,
} from '@/lib/admin_daily_verse_warm';

function numOr(v: string, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export default function AdminDailyVerseWarmPanel() {
  const [data, setData] = useState<DailyVerseWarmStatus | null>(null);
  const [draft, setDraft] = useState<DailyVerseWarmSettings | null>(null);
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
      const res = await fetchDailyVerseWarmStatus();
      setData(res);
      setDraft(res.settings);
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
      setDraft(res.settings);
      flash(next ? '暖场已开启' : '暖场已关闭');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const tickToast = (res: DailyVerseWarmStatus & { tick: Record<string, unknown> }) => {
    const skipped = res.tick?.skipped;
    if (skipped === 'disabled') {
      flash('请先打开暖场开关');
      return;
    }
    const added = (res.tick?.personas_added as number) ?? 0;
    const likes = (res.tick?.likes_written as number) ?? 0;
    if (skipped === 'caught_up') {
      flash('当前进度已跟上，无需写入');
      return;
    }
    flash(
      added > 0
        ? `已写入 ${added} 人互动（赞 ${likes}）`
        : '本次未新增互动',
    );
  };

  const onRunOnce = async () => {
    setRunning(true);
    setErr(null);
    try {
      const res = await runDailyVerseWarmTick('manual');
      setData(res);
      setDraft(res.settings);
      tickToast(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '执行失败');
    } finally {
      setRunning(false);
    }
  };

  const onCatchUp = async () => {
    const n = draft?.catch_up_max_writes ?? 12;
    if (
      !window.confirm(
        `将按「追赶」模式写入，单批最多 ${n} 人，可能明显拉高今日暖场数。确定继续？`,
      )
    ) {
      return;
    }
    setRunning(true);
    setErr(null);
    try {
      const res = await runDailyVerseWarmTick('catch_up');
      setData(res);
      setDraft(res.settings);
      tickToast(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '执行失败');
    } finally {
      setRunning(false);
    }
  };

  const onSaveParams = async () => {
    if (!draft) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await patchDailyVerseWarmSettings(draft);
      setData(res);
      setDraft(res.settings);
      flash('参数已保存');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const s = data?.settings;
  const t = data?.today;
  const d = draft;

  return (
    <section className="settings-card admin-warm-panel" style={{ marginBottom: 16 }}>
      <div className="admin-warm-head">
        <div>
          <h2 className="admin-section-title" style={{ margin: 0 }}>
            每日经文暖场
          </h2>
          <p className="muted" style={{ fontSize: 13, marginTop: 6, marginBottom: 0 }}>
            8800xxxx 专用账号补互动缺口，不计入数据统计。「跑一波」等同单次 cron，不会一次补满全天欠账。
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
      ) : t && s && d ? (
        <>
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

          <div
            className="admin-warm-params"
            style={{
              marginTop: 16,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: 10,
              fontSize: 13,
            }}
          >
            <label>
              <span className="muted">爬坡起点</span>
              <input
                type="date"
                className="input"
                value={d.t0?.slice(0, 10) || ''}
                onChange={(e) => setDraft({ ...d, t0: e.target.value })}
              />
            </label>
            <label>
              <span className="muted">爬坡天数</span>
              <input
                type="number"
                min={1}
                className="input"
                value={d.ramp_days}
                onChange={(e) => setDraft({ ...d, ramp_days: numOr(e.target.value, d.ramp_days) })}
              />
            </label>
            <label>
              <span className="muted">下限人数</span>
              <input
                type="number"
                min={1}
                className="input"
                value={d.cap_min}
                onChange={(e) => setDraft({ ...d, cap_min: numOr(e.target.value, d.cap_min) })}
              />
            </label>
            <label>
              <span className="muted">上限人数</span>
              <input
                type="number"
                min={1}
                max={99}
                className="input"
                value={d.cap_max}
                onChange={(e) => setDraft({ ...d, cap_max: numOr(e.target.value, d.cap_max) })}
              />
            </label>
            <label>
              <span className="muted">真实加成</span>
              <input
                type="number"
                min={0}
                className="input"
                value={d.max_boost}
                onChange={(e) => setDraft({ ...d, max_boost: numOr(e.target.value, d.max_boost) })}
              />
            </label>
            <label>
              <span className="muted">cron 每波</span>
              <input
                type="number"
                min={1}
                max={30}
                className="input"
                value={d.cron_max_writes}
                onChange={(e) =>
                  setDraft({ ...d, cron_max_writes: numOr(e.target.value, d.cron_max_writes) })
                }
              />
            </label>
            <label>
              <span className="muted">手动每波</span>
              <input
                type="number"
                min={1}
                max={30}
                className="input"
                value={d.manual_max_writes}
                onChange={(e) =>
                  setDraft({ ...d, manual_max_writes: numOr(e.target.value, d.manual_max_writes) })
                }
              />
            </label>
            <label>
              <span className="muted">追赶每波</span>
              <input
                type="number"
                min={1}
                max={30}
                className="input"
                value={d.catch_up_max_writes}
                onChange={(e) =>
                  setDraft({
                    ...d,
                    catch_up_max_writes: numOr(e.target.value, d.catch_up_max_writes),
                  })
                }
              />
            </label>
            <label>
              <span className="muted">cron 间隔(分)</span>
              <input
                type="number"
                min={1}
                className="input"
                value={d.cron_interval_minutes}
                onChange={(e) =>
                  setDraft({
                    ...d,
                    cron_interval_minutes: numOr(e.target.value, d.cron_interval_minutes),
                  })
                }
              />
            </label>
            <label>
              <span className="muted">追赶策略</span>
              <select
                className="input"
                value={d.catch_up_policy}
                onChange={(e) =>
                  setDraft({
                    ...d,
                    catch_up_policy: e.target.value as DailyVerseWarmSettings['catch_up_policy'],
                  })
                }
              >
                <option value="spread_by_remaining_slots">按剩余 cron 分摊</option>
                <option value="per_tick_cap">仅按每波上限</option>
              </select>
            </label>
            <label>
              <span className="muted">日开始</span>
              <input
                type="number"
                min={0}
                max={23}
                className="input"
                value={d.day_start_hour}
                onChange={(e) =>
                  setDraft({ ...d, day_start_hour: numOr(e.target.value, d.day_start_hour) })
                }
              />
            </label>
            <label>
              <span className="muted">日结束</span>
              <input
                type="number"
                min={1}
                max={24}
                className="input"
                value={d.day_end_hour}
                onChange={(e) =>
                  setDraft({ ...d, day_end_hour: numOr(e.target.value, d.day_end_hour) })
                }
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <input
                type="checkbox"
                checked={d.use_day_spread_timestamps}
                onChange={(e) =>
                  setDraft({ ...d, use_day_spread_timestamps: e.target.checked })
                }
              />
              <span className="muted">时间戳按全天分散</span>
            </label>
          </div>
          <button
            type="button"
            className="btn secondary"
            style={{ marginTop: 10 }}
            disabled={saving || loading}
            onClick={() => void onSaveParams()}
          >
            {saving ? '保存中…' : '保存参数'}
          </button>
        </>
      ) : null}

      <p className="muted" style={{ fontSize: 12, marginTop: 12, lineHeight: 1.5 }}>
        定时任务请配置{' '}
        <code style={{ fontSize: 11 }}>POST /content/cron/daily-verse-warm</code>（与推送 cron
        同密钥），建议 {d?.day_start_hour ?? 6}:00–{d?.day_end_hour ?? 23}:00 每{' '}
        {d?.cron_interval_minutes ?? 30} 分钟一次。
      </p>

      <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn secondary"
          disabled={running || loading || !s?.enabled}
          onClick={() => void onRunOnce()}
        >
          {running ? '执行中…' : `立即跑一波（+${d?.manual_max_writes ?? 2}）`}
        </button>
        <button
          type="button"
          className="btn ghost"
          disabled={running || loading || !s?.enabled}
          onClick={() => void onCatchUp()}
        >
          追赶今日进度
        </button>
        <button type="button" className="btn ghost" disabled={loading} onClick={() => void load()}>
          刷新
        </button>
      </div>
    </section>
  );
}
