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
import {
  getGroupEveningReminder,
  reminderPolicySummary,
  rescheduleGroupEveningReminder,
  setGroupEveningReminder,
  type GroupEveningReminder,
} from '@/lib/group_reminder';

const SLOTS = [
  { key: 'morning', label: '晨读', hour: 7, minute: 0 },
  { key: 'noon', label: '午间', hour: 12, minute: 30 },
  { key: 'evening', label: '晚读', hour: 21, minute: 0 },
] as const;

function slotActive(pref: ReminderPref, hour: number, minute: number) {
  return pref.hour === hour && pref.minute === minute;
}

export default function RemindersPage() {
  const [pref, setPref] = useState<ReminderPref>({ enabled: false, hour: 8, minute: 0 });
  const [groupPref, setGroupPref] = useState<GroupEveningReminder>({
    enabled: false,
    hour: 20,
    minute: 30,
  });
  const [customHour, setCustomHour] = useState(8);
  const [customMinute, setCustomMinute] = useState(0);
  const [groupHour, setGroupHour] = useState(20);
  const [groupMinute, setGroupMinute] = useState(30);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const p = getReminder();
    const g = getGroupEveningReminder();
    setPref(p);
    setGroupPref(g);
    setCustomHour(p.hour);
    setCustomMinute(p.minute);
    setGroupHour(g.hour);
    setGroupMinute(g.minute);
    reschedule();
    rescheduleGroupEveningReminder();
  }, []);

  const applyTime = async (hour: number, minute: number, enabled = true) => {
    const h = Math.min(23, Math.max(0, hour));
    const m = Math.min(59, Math.max(0, minute));
    const next = { enabled, hour: h, minute: m };
    if (enabled && !pref.enabled) {
      const ok = await ensurePermission();
      if (!ok) {
        setMsg('请在浏览器或系统设置中允许通知');
        return;
      }
    }
    setPref(next);
    setCustomHour(h);
    setCustomMinute(m);
    setReminder(next);
    setMsg(`已设为每天 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  };

  const toggleMain = async (enabled: boolean) => {
    if (enabled) {
      const ok = await ensurePermission();
      if (!ok) {
        setMsg('请在浏览器或系统设置中允许通知');
        return;
      }
    }
    const next = { ...pref, enabled };
    setPref(next);
    setReminder(next);
    setMsg(enabled ? '已开启每日提醒' : '已关闭提醒');
  };

  const toggleGroup = async (enabled: boolean) => {
    if (enabled) {
      const ok = await ensurePermission();
      if (!ok) {
        setMsg('请在浏览器或系统设置中允许通知');
        return;
      }
    }
    const next = { ...groupPref, enabled };
    setGroupPref(next);
    setGroupEveningReminder(next);
    rescheduleGroupEveningReminder();
    setMsg(enabled ? '已开启群打卡晚间提醒' : '已关闭群打卡提醒');
  };

  const applyGroupTime = async () => {
    const h = Math.min(23, Math.max(0, groupHour));
    const m = Math.min(59, Math.max(0, groupMinute));
    if (!groupPref.enabled) {
      const ok = await ensurePermission();
      if (!ok) {
        setMsg('请在浏览器或系统设置中允许通知');
        return;
      }
    }
    const next = { enabled: true, hour: h, minute: m };
    setGroupPref(next);
    setGroupHour(h);
    setGroupMinute(m);
    setGroupEveningReminder(next);
    rescheduleGroupEveningReminder();
    setMsg(`群打卡提醒：每天 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}（仅未打卡时）`);
  };

  const presetActive = SLOTS.some((s) => slotActive(pref, s.hour, s.minute));

  return (
    <main className="container">
      <div className="section-row" style={{ marginTop: 0 }}>
        <Link href="/profile" className="muted">‹ 我的</Link>
        <strong>推送提醒</strong>
        <span />
      </div>
      {msg && <p className="muted" style={{ marginTop: 8 }}>{msg}</p>}

      <p className="muted reminder-policy-summary" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.55 }}>
        {reminderPolicySummary()}
      </p>

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
        <p className="muted" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.55 }}>
          默认关闭。在你设定的时间，用一条温柔通知提醒你打开圣经继续阅读。
        </p>
      </div>

      <p className="muted" style={{ marginTop: 14, fontSize: 13 }}>推荐时段</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {SLOTS.map((s) => {
          const active = pref.enabled && slotActive(pref, s.hour, s.minute);
          return (
            <button
              key={s.key}
              type="button"
              className={`card card-2 reminder-slot${active ? ' reminder-slot-active' : ''}`}
              onClick={() => void applyTime(s.hour, s.minute)}
            >
              <strong>{s.label}</strong>
              <span className="muted">
                {String(s.hour).padStart(2, '0')}:{String(s.minute).padStart(2, '0')}
                {active ? ' · 当前' : ''}
              </span>
            </button>
          );
        })}
      </div>

      <div className="card card-2" style={{ marginTop: 14 }}>
        <strong style={{ fontSize: 14 }}>自定义时间</strong>
        <p className="muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 10 }}>
          选择更适合你的提醒时刻
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <label className="muted" style={{ fontSize: 12 }}>
            时
            <input
              className="search-input"
              type="number"
              min={0}
              max={23}
              value={customHour}
              onChange={(e) => setCustomHour(Number(e.target.value))}
              style={{ width: 72, marginLeft: 6, textAlign: 'center' }}
            />
          </label>
          <label className="muted" style={{ fontSize: 12 }}>
            分
            <input
              className="search-input"
              type="number"
              min={0}
              max={59}
              value={customMinute}
              onChange={(e) => setCustomMinute(Number(e.target.value))}
              style={{ width: 72, marginLeft: 6, textAlign: 'center' }}
            />
          </label>
          <button
            type="button"
            className="btn"
            style={{ marginTop: 0, padding: '8px 14px', flexShrink: 0 }}
            onClick={() => void applyTime(customHour, customMinute)}
          >
            应用
          </button>
        </div>
        {pref.enabled && !presetActive && (
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            当前：每天 {String(pref.hour).padStart(2, '0')}:{String(pref.minute).padStart(2, '0')}
          </p>
        )}
      </div>

      <div className="card card-2" style={{ marginTop: 18 }}>
        <div className="section-row">
          <span>群打卡晚间提醒</span>
          <button
            type="button"
            className={`toggle ${groupPref.enabled ? 'on' : ''}`}
            onClick={() => void toggleGroup(!groupPref.enabled)}
          >
            {groupPref.enabled ? '开' : '关'}
          </button>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.55 }}>
          默认关闭。每晚仅在你未打卡时提醒一次，不会为回应或点赞推送。
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12 }}>
          <label className="muted" style={{ fontSize: 12 }}>
            时
            <input
              className="search-input"
              type="number"
              min={0}
              max={23}
              value={groupHour}
              onChange={(e) => setGroupHour(Number(e.target.value))}
              style={{ width: 72, marginLeft: 6, textAlign: 'center' }}
            />
          </label>
          <label className="muted" style={{ fontSize: 12 }}>
            分
            <input
              className="search-input"
              type="number"
              min={0}
              max={59}
              value={groupMinute}
              onChange={(e) => setGroupMinute(Number(e.target.value))}
              style={{ width: 72, marginLeft: 6, textAlign: 'center' }}
            />
          </label>
          <button
            type="button"
            className="btn"
            style={{ marginTop: 0, padding: '8px 14px', flexShrink: 0 }}
            onClick={() => void applyGroupTime()}
          >
            应用
          </button>
        </div>
      </div>
    </main>
  );
}
