'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ensurePermission,
  getReminder,
  reschedule,
  setReminder,
  type ReminderPref,
} from '@/lib/reminder';

const SLOTS = [
  { key: 'morning', label: '晨读', hour: 7, minute: 0 },
  { key: 'noon', label: '午间', hour: 12, minute: 30 },
  { key: 'evening', label: '晚读', hour: 21, minute: 0 },
] as const;

const EXTRA_KEY = 'presto_reminder_extra';

function readExtra(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(EXTRA_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeExtra(v: Record<string, boolean>) {
  localStorage.setItem(EXTRA_KEY, JSON.stringify(v));
}

export default function RemindersPage() {
  const [pref, setPref] = useState<ReminderPref>({ enabled: false, hour: 8, minute: 0 });
  const [extra, setExtra] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setPref(getReminder());
    setExtra(readExtra());
    reschedule();
  }, []);

  const toggleMain = async (enabled: boolean) => {
    if (enabled) {
      const ok = await ensurePermission();
      if (!ok) {
        setMsg('请在浏览器设置中允许通知');
        return;
      }
    }
    const next = { ...pref, enabled };
    setPref(next);
    setReminder(next);
    setMsg(enabled ? '已开启每日提醒' : '已关闭');
  };

  const pickSlot = async (hour: number, minute: number) => {
    const next = { ...pref, hour, minute, enabled: true };
    if (!pref.enabled) {
      const ok = await ensurePermission();
      if (!ok) {
        setMsg('需要通知权限');
        return;
      }
    }
    setPref(next);
    setReminder(next);
    setMsg(`已设为 ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
  };

  const toggleExtra = (key: string) => {
    const next = { ...extra, [key]: !extra[key] };
    setExtra(next);
    writeExtra(next);
    void import('@/lib/web_push').then((m) => m.subscribeWebPush().catch(() => {}));
  };

  return (
    <main className="container">
      <div className="section-row" style={{ marginTop: 0 }}>
        <Link href="/profile" className="muted">‹ 我的</Link>
        <strong>推送提醒</strong>
        <span />
      </div>
      {msg && <p className="muted" style={{ marginTop: 8 }}>{msg}</p>}

      <div className="card card-2" style={{ marginTop: 12 }}>
        <div className="section-row">
          <span>每日读经提醒</span>
          <button
            type="button"
            className={`toggle ${pref.enabled ? 'on' : ''}`}
            onClick={() => void toggleMain(!pref.enabled)}
          >
            {pref.enabled ? '开' : '关'}
          </button>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          温柔提醒，不羞辱。开启后将登记 Web Push，应用关闭时也可收到摘要（需服务器配置 VAPID）。
        </p>
      </div>

      <p className="muted" style={{ marginTop: 14, fontSize: 13 }}>推荐时段（最多 3 个）</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {SLOTS.map((s) => (
          <button
            key={s.key}
            type="button"
            className="card card-2 reminder-slot"
            onClick={() => void pickSlot(s.hour, s.minute)}
          >
            <strong>{s.label}</strong>
            <span className="muted">
              {String(s.hour).padStart(2, '0')}:{String(s.minute).padStart(2, '0')}
            </span>
          </button>
        ))}
      </div>

      <div className="card card-2" style={{ marginTop: 14 }}>
        <p className="muted" style={{ fontSize: 12 }}>可选召回（默认关）</p>
        {[
          ['streak', '断签温和召回'],
          ['group', '群待打卡摘要'],
        ].map(([k, label]) => (
          <div key={k} className="section-row" style={{ marginTop: 8 }}>
            <span>{label}</span>
            <button
              type="button"
              className={`toggle ${extra[k] ? 'on' : ''}`}
              onClick={() => toggleExtra(k)}
            >
              {extra[k] ? '开' : '关'}
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}
