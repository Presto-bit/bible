'use client';

import Link from 'next/link';
import PageBackBar from '@/components/PageBackBar';
import { markRouteNavigation } from '@/lib/pwa_tab_nav';
import {
  PROFILE_SETTINGS_BACK_LABEL,
  PROFILE_SETTINGS_HREF,
} from '@/lib/profile_settings';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
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
  rescheduleGroupEveningReminder,
  setGroupEveningReminder,
  type GroupEveningReminder,
} from '@/lib/group_reminder';
import { getNotifPrefs, setNotifPrefs, type NotifPrefs } from '@/lib/notif_prefs';
import { checkPushReadiness, pushReadinessHint } from '@/lib/push_status';
import { syncPushSubscription, rescheduleAllNotifications } from '@/lib/notifications';
import { reminderHeroSub, reminderHeroTitle } from '@/lib/beiai_habit_copy';

const SLOTS = [
  { key: 'morning', label: '晨读', hour: 7, minute: 0 },
  { key: 'noon', label: '午间', hour: 12, minute: 30 },
  { key: 'evening', label: '晚读', hour: 21, minute: 0 },
] as const;

function formatTime(hour: number, minute: number) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function slotActive(pref: ReminderPref, hour: number, minute: number) {
  return pref.hour === hour && pref.minute === minute;
}

export default function RemindersPage() {
  useEdgeSwipeBack({ href: PROFILE_SETTINGS_HREF });

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
  const [notif, setNotif] = useState<NotifPrefs>({
    readingDnd: true,
    socialDigest: true,
    streakRecall: false,
  });
  const [msg, setMsg] = useState('');
  const [pushHint, setPushHint] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    void checkPushReadiness().then((r) => {
      if (!r.ok) setPushHint(pushReadinessHint(r));
    });
  }, []);

  useEffect(() => {
    const p = getReminder();
    const g = getGroupEveningReminder();
    setPref(p);
    setGroupPref(g);
    setNotif(getNotifPrefs());
    setCustomHour(p.hour);
    setCustomMinute(p.minute);
    setGroupHour(g.hour);
    setGroupMinute(g.minute);
    const preset = SLOTS.some((s) => slotActive(p, s.hour, s.minute));
    setCustomOpen(p.enabled && !preset);
    reschedule();
    rescheduleGroupEveningReminder();
    rescheduleAllNotifications();
  }, []);

  const patchNotif = async (patch: Partial<NotifPrefs>) => {
    const next = setNotifPrefs(patch);
    setNotif(next);
    if (next.socialDigest || next.streakRecall) {
      const ok = await ensurePermission();
      if (!ok) setMsg('请在浏览器或系统设置中允许通知');
      void syncPushSubscription();
    } else {
      void syncPushSubscription();
    }
    if (patch.readingDnd !== undefined) {
      setMsg(patch.readingDnd ? '已开启读经勿扰' : '已关闭读经勿扰');
    } else if (patch.socialDigest !== undefined) {
      setMsg(patch.socialDigest ? '已开启消息摘要' : '已关闭消息摘要');
    }
  };

  const applyTime = async (hour: number, minute: number, enabled = true) => {
    const h = Math.min(23, Math.max(0, hour));
    const m = Math.min(59, Math.max(0, minute));
    if (enabled && !pref.enabled) {
      const ok = await ensurePermission();
      if (!ok) {
        setMsg('请在浏览器或系统设置中允许通知');
        return;
      }
    }
    const next = { enabled, hour: h, minute: m };
    setPref(next);
    setCustomHour(h);
    setCustomMinute(m);
    setReminder(next);
    setMsg(enabled ? `已设为每天 ${formatTime(h, m)}` : '已关闭提醒');
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
    setMsg(`群打卡提醒：每天 ${formatTime(h, m)}（仅未打卡时）`);
  };

  return (
    <main className="container reminder-page">
      <header className="page-head">
        <PageBackBar
          href={PROFILE_SETTINGS_HREF}
          label={PROFILE_SETTINGS_BACK_LABEL}
          onClick={() => markRouteNavigation()}
        />
        <h2 className="page-head-title">提醒与勿扰</h2>
      </header>

      {msg ? <p className="muted reminder-page-msg">{msg}</p> : null}
      {pushHint ? (
        <p className="muted reminder-page-hint">{pushHint}</p>
      ) : null}

      {/* 一屏一事：主提醒 */}
      <section className="card reminder-hero" aria-labelledby="reminder-hero-title">
        <div className="section-row reminder-hero-head">
          <div>
            <p className="muted reminder-hero-kicker">每日读经</p>
            <strong id="reminder-hero-title">
              {reminderHeroTitle(pref.enabled, formatTime(pref.hour, pref.minute))}
            </strong>
            <p className="muted reminder-hero-sub">{reminderHeroSub(pref.enabled)}</p>
          </div>
          <button
            type="button"
            className={`toggle ${pref.enabled ? 'on' : ''}`}
            aria-label={pref.enabled ? '关闭每日提醒' : '开启每日提醒'}
            onClick={() => void toggleMain(!pref.enabled)}
          >
            {pref.enabled ? '开' : '关'}
          </button>
        </div>

        <div className="reminder-slot-row" role="group" aria-label="推荐时段">
          {SLOTS.map((s) => {
            const active = pref.enabled && slotActive(pref, s.hour, s.minute);
            return (
              <button
                key={s.key}
                type="button"
                className={`reminder-chip${active ? ' is-active' : ''}`}
                onClick={() => void applyTime(s.hour, s.minute)}
              >
                <strong>{s.label}</strong>
                <span>{formatTime(s.hour, s.minute)}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="text-link reminder-custom-toggle"
          onClick={() => setCustomOpen((v) => !v)}
        >
          {customOpen ? '收起自定义' : '自定义时间'}
        </button>

        {customOpen ? (
          <div className="reminder-custom-row">
            <label className="muted">
              时
              <input
                className="search-input"
                type="number"
                min={0}
                max={23}
                value={customHour}
                onChange={(e) => setCustomHour(Number(e.target.value))}
              />
            </label>
            <label className="muted">
              分
              <input
                className="search-input"
                type="number"
                min={0}
                max={59}
                value={customMinute}
                onChange={(e) => setCustomMinute(Number(e.target.value))}
              />
            </label>
            <button
              type="button"
              className="btn"
              onClick={() => void applyTime(customHour, customMinute)}
            >
              应用
            </button>
          </div>
        ) : null}
      </section>

      {/* 原则：读经勿扰 */}
      <section className="card reminder-dnd-card">
        <div className="section-row">
          <div>
            <strong>读经勿扰</strong>
            <p className="muted reminder-card-sub">
              默认开启。在圣经阅读页不弹群/私信通知；底栏发现永不显示未读角标。
            </p>
          </div>
          <button
            type="button"
            className={`toggle ${notif.readingDnd ? 'on' : ''}`}
            onClick={() => void patchNotif({ readingDnd: !notif.readingDnd })}
          >
            {notif.readingDnd ? '开' : '关'}
          </button>
        </div>
      </section>

      <button
        type="button"
        className="text-link reminder-more-toggle"
        onClick={() => setMoreOpen((v) => !v)}
      >
        {moreOpen ? '收起可选提醒' : '可选：消息与群打卡'}
      </button>

      {moreOpen ? (
        <div className="reminder-more">
          <section className="card">
            <div className="section-row">
              <div>
                <strong>消息摘要</strong>
                <p className="muted reminder-card-sub">
                  私信/群消息约 1 分钟合并一条（免打扰除外，@ 可穿透），不逐条打扰。
                </p>
              </div>
              <button
                type="button"
                className={`toggle ${notif.socialDigest ? 'on' : ''}`}
                onClick={() => void patchNotif({ socialDigest: !notif.socialDigest })}
              >
                {notif.socialDigest ? '开' : '关'}
              </button>
            </div>
          </section>

          <section className="card" style={{ marginTop: 10 }}>
            <div className="section-row">
              <div>
                <strong>群打卡晚间提醒</strong>
                <p className="muted reminder-card-sub">
                  默认关闭。仅在你未打卡时提醒一次，不为点赞/回应推送。
                </p>
              </div>
              <button
                type="button"
                className={`toggle ${groupPref.enabled ? 'on' : ''}`}
                onClick={() => void toggleGroup(!groupPref.enabled)}
              >
                {groupPref.enabled ? '开' : '关'}
              </button>
            </div>
            <div className="reminder-custom-row" style={{ marginTop: 12 }}>
              <label className="muted">
                时
                <input
                  className="search-input"
                  type="number"
                  min={0}
                  max={23}
                  value={groupHour}
                  onChange={(e) => setGroupHour(Number(e.target.value))}
                />
              </label>
              <label className="muted">
                分
                <input
                  className="search-input"
                  type="number"
                  min={0}
                  max={59}
                  value={groupMinute}
                  onChange={(e) => setGroupMinute(Number(e.target.value))}
                />
              </label>
              <button type="button" className="btn" onClick={() => void applyGroupTime()}>
                应用
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <p className="muted reminder-page-foot">
        提醒默认关闭。需要时再开，把读经留在日常里即可。
        {' · '}
        <Link href="/profile" onClick={() => markRouteNavigation()}>
          回我的
        </Link>
      </p>
    </main>
  );
}
