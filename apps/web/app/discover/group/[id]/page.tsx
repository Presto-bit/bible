'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { GroupChatFeed } from '@/components/group/GroupChatFeed';
import { GroupComposer } from '@/components/group/GroupComposer';
import { GroupMembersPanel } from '@/components/group/GroupMembersPanel';
import { GroupPlanStrip } from '@/components/group/GroupPlanStrip';
import { GroupTaskCompleteSheet } from '@/components/group/GroupTaskCompleteSheet';
import { api, type GroupDetail, type GroupMessage, type PlanSummary } from '@/lib/api';

export default function GroupPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const gid = params.id;
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [feed, setFeed] = useState<GroupMessage[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [announceDraft, setAnnounceDraft] = useState('');
  const [planDraft, setPlanDraft] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [taskComplete, setTaskComplete] = useState<{
    taskId: string;
    title: string;
    ref?: string | null;
  } | null>(null);
  const feedEndRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    try {
      const [d, f] = await Promise.all([api.groupDetail(gid), api.groupFeed(gid)]);
      setDetail(d);
      setFeed(f.messages);
      setErr(null);
    } catch (e) {
      setErr(String(e));
    }
  }, [gid]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [feed.length]);

  useEffect(() => {
    if (detail) {
      setAnnounceDraft(detail.announcement || '');
      setPlanDraft(detail.plan_id || '');
      setNameDraft(detail.name);
    }
  }, [detail]);

  useEffect(() => {
    if (showSettings) {
      api.plans().then((r) => setPlans(r.plans)).catch(() => setPlans([]));
    }
  }, [showSettings]);

  if (err) {
    return (
      <main className="container">
        <p className="muted">{err}</p>
      </main>
    );
  }
  if (!detail) {
    return (
      <main className="container">
        <p className="muted">加载中…</p>
      </main>
    );
  }

  const isOwner = detail.role === 'owner';
  const members = detail.members.length;
  const checkedToday = detail.checked_in_today ?? 0;
  const progressPct = members > 0 ? Math.round((checkedToday / members) * 100) : 0;

  const react = async (mid: string, emoji: string) => {
    try {
      await api.react(mid, emoji);
      reload();
    } catch {
      /* ignore */
    }
  };

  const reportMsg = async (mid: string) => {
    const reason = window.prompt('举报原因（可选）') ?? '';
    try {
      const r = await api.reportMessage(mid, reason);
      alert(r.hidden ? '已举报，该内容已被隐藏待复核' : '已举报，感谢反馈');
      reload();
    } catch (e) {
      alert(`举报失败：${e}`);
    }
  };

  const deleteMsg = async (mid: string) => {
    if (!window.confirm('确定删除这条内容？')) return;
    try {
      await api.deleteMessage(mid);
      reload();
    } catch (e) {
      alert(`删除失败：${e}`);
    }
  };

  const completeTask = (taskId: string, title: string, ref?: string | null) => {
    setTaskComplete({ taskId, title, ref });
  };

  const submitTaskComplete = async (body: string) => {
    if (!taskComplete) return;
    await api.checkin(gid, {
      task_id: taskComplete.taskId,
      ref: taskComplete.ref || undefined,
      body,
    });
    await reload();
  };

  const handleCheckin = async (payload: {
    ref?: string;
    task_id?: string;
    body?: string;
  }) => {
    setBusy(true);
    try {
      await api.checkin(gid, payload);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const handleCreateTask = async (payload: {
    title: string;
    ref?: string;
    due_at?: string;
    template_id?: string;
  }) => {
    setBusy(true);
    try {
      await api.createTask(gid, payload.title, payload.ref, {
        due_at: payload.due_at,
        template_id: payload.template_id,
      });
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async () => {
    setBusy(true);
    try {
      await api.updateGroup(gid, {
        name: nameDraft.trim(),
        announcement: announceDraft,
        ...(planDraft ? { plan_id: planDraft } : { clear_plan: true }),
      });
      setShowSettings(false);
      await reload();
    } catch (e) {
      alert(`保存失败：${e}`);
    } finally {
      setBusy(false);
    }
  };

  const dissolve = async () => {
    if (!window.confirm('确定解散此共读群？所有成员将被移出，此操作不可撤销。')) return;
    setBusy(true);
    try {
      await api.dissolveGroup(gid);
      router.push('/discover');
    } catch (e) {
      alert(`解散失败：${e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="group-page">
      <header className="group-header">
        <Link href="/discover" className="icon-btn" aria-label="返回">
          ‹
        </Link>
        <div className="group-header-main">
          <h1>{detail.name}</h1>
          <p className="muted">
            {members} 人 · 今日 {checkedToday}/{members} 已打卡
            {detail.plan_title && ` · ${detail.plan_title}`}
            {isOwner && ` · 邀请码 ${detail.join_code}`}
          </p>
        </div>
        {isOwner && (
          <button
            type="button"
            className="icon-btn"
            aria-label="群设置"
            onClick={() => {
              setShowSettings((v) => !v);
              setShowMembers(false);
            }}
          >
            设置
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          aria-label="成员"
          onClick={() => {
              setShowMembers((v) => !v);
              setShowSettings(false);
            }}
        >
          成员
        </button>
      </header>

      {showMembers && (
        <GroupMembersPanel
          gid={gid}
          members={detail.members}
          isOwner={isOwner}
          joinCode={isOwner ? detail.join_code : undefined}
          planDaysTotal={detail.plan_days_total}
          onChanged={reload}
        />
      )}

      {showSettings && isOwner && (
        <div className="group-settings-panel card card-2">
          <strong>群设置</strong>
          <label className="group-composer-label" htmlFor="group-name" style={{ marginTop: 10 }}>
            群名称
          </label>
          <input
            id="group-name"
            className="search-input"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
          />
          <label className="group-composer-label" htmlFor="group-plan" style={{ marginTop: 10 }}>
            绑定读经计划
          </label>
          <select
            id="group-plan"
            className="search-input"
            value={planDraft}
            onChange={(e) => setPlanDraft(e.target.value)}
          >
            <option value="">不绑定计划</option>
            {plans.map((p) => (
              <option key={p.plan_id} value={p.plan_id}>
                {p.title}
              </option>
            ))}
          </select>
          <label className="group-composer-label" htmlFor="group-announce" style={{ marginTop: 10 }}>
            群公告
          </label>
          <textarea
            id="group-announce"
            className="group-composer-text"
            rows={3}
            placeholder="发布群公告（全员可见）"
            value={announceDraft}
            onChange={(e) => setAnnounceDraft(e.target.value)}
          />
          <button type="button" className="btn" style={{ width: '100%', marginTop: 8 }} disabled={busy} onClick={saveSettings}>
            {busy ? '保存中…' : '保存设置'}
          </button>
          <button
            type="button"
            className="font-pill danger-pill"
            style={{ width: '100%', marginTop: 12 }}
            disabled={busy}
            onClick={dissolve}
          >
            解散共读群
          </button>
        </div>
      )}

      {detail.announcement && !showSettings && (
        <div className="group-announcement card card-2">
          <span className="group-composer-label">群公告</span>
          <p style={{ margin: '6px 0 0', lineHeight: 1.55 }}>{detail.announcement}</p>
        </div>
      )}

      {!detail.icebreaker_done && (
        <div className="card card-tint card-2 icebreaker-card" style={{ margin: '8px 12px' }}>
          <strong>欢迎加入共读群</strong>
          <p className="muted" style={{ fontSize: 13, margin: '6px 0 10px' }}>
            发第一条打卡，和大家打个招呼吧。可分享今日经文或一句感想。
          </p>
        </div>
      )}

      <GroupPlanStrip
        detail={detail}
        onShowMembers={() => {
          setShowMembers(true);
          setShowSettings(false);
        }}
      />

      <div className="group-progress-strip">
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <span className="muted" style={{ fontSize: 12 }}>
          {detail.my_checked_in_today ? '今日已打卡 ✓' : '今日待打卡'}
          {(detail.open_tasks ?? 0) > 0 && ` · ${detail.open_tasks} 个任务待完成`}
        </span>
      </div>

      <div className="group-feed-wrap">
        <GroupChatFeed
          gid={gid}
          messages={feed}
          isOwner={isOwner}
          onReact={react}
          onReport={reportMsg}
          onDelete={deleteMsg}
          onCompleteTask={completeTask}
        />
        <div ref={feedEndRef} />
      </div>

      <div className="group-composer-wrap">
        <GroupComposer
          isOwner={isOwner}
          tasks={detail.tasks}
          busy={busy}
          onCheckin={handleCheckin}
          onCreateTask={handleCreateTask}
        />
      </div>

      {taskComplete && (
        <GroupTaskCompleteSheet
          title={taskComplete.title}
          refLabel={taskComplete.ref}
          onSubmit={submitTaskComplete}
          onClose={() => setTaskComplete(null)}
        />
      )}
    </main>
  );
}
