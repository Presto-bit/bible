'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { GroupActivityFeed } from '@/components/group/GroupActivityFeed';
import { GroupCheckinWall } from '@/components/group/GroupCheckinWall';
import { GroupComposerBar } from '@/components/group/GroupComposerBar';
import { GroupComposerSheet } from '@/components/group/GroupComposerSheet';
import { GroupNavBar } from '@/components/group/GroupNavBar';
import { GroupSettingsSheet } from '@/components/group/GroupSettingsSheet';
import { GroupTaskCompleteSheet } from '@/components/group/GroupTaskCompleteSheet';
import { GroupTodayFocus } from '@/components/group/GroupTodayFocus';
import { GroupToast } from '@/components/group/GroupToast';
import { api, type GeneratedPlan, type GroupDetail, type GroupMessage, type PlanSummary } from '@/lib/api';
import { loadGeneratedPlans } from '@/lib/generated_plans';
import { myDisplayName, normalizeGroupDetail } from '@/lib/group_ui';
import { dismissPendingGroup, markGroupsListDirty } from '@/lib/groups_refresh';
import { formatGroupRefLabel } from '@/lib/ref_label';

function GroupPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ id: string }>();
  const rawId = params.id;
  const gid = Array.isArray(rawId) ? rawId[0] : rawId ?? '';
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [feed, setFeed] = useState<GroupMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [generatedPlans, setGeneratedPlans] = useState<GeneratedPlan[]>([]);
  const [planScopes, setPlanScopes] = useState<{ id: string; label: string }[]>([]);
  const [announceDraft, setAnnounceDraft] = useState('');
  const [planDraft, setPlanDraft] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [taskComplete, setTaskComplete] = useState<{
    taskId: string;
    title: string;
    ref?: string | null;
  } | null>(null);
  const feedEndRef = useRef<HTMLDivElement>(null);
  const feedWrapRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2400);
  }, []);

  const reload = useCallback(async () => {
    if (!gid) {
      setErr('群 ID 无效');
      return;
    }
    try {
      const [d, f] = await Promise.all([api.groupDetail(gid), api.groupFeed(gid)]);
      setDetail(normalizeGroupDetail(d));
      const incoming = Array.isArray(f.messages) ? f.messages : [];
      setFeed((prev) => {
        const temps = prev.filter((m) => m.id.startsWith('temp-'));
        if (!temps.length) return incoming;
        const merged = [...incoming];
        for (const t of temps) {
          const dup = merged.some(
            (m) =>
              m.mine
              && m.kind === t.kind
              && (m.body || '') === (t.body || '')
              && (m.ref || '') === (t.ref || '')
              && Math.abs(new Date(m.created_at).getTime() - new Date(t.created_at).getTime()) < 120000,
          );
          if (!dup) merged.push(t);
        }
        merged.sort((a, b) => a.created_at.localeCompare(b.created_at));
        return merged;
      });
      setHasMore(Boolean(f.has_more));
      setErr(null);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      if (detail.includes('404')) {
        dismissPendingGroup(gid);
        markGroupsListDirty();
        router.replace('/discover/groups');
        return;
      }
      setErr(detail);
    }
  }, [gid]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [feed.length]);

  useEffect(() => {
    if (searchParams.get('focus') === 'checkin') {
      setComposerOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (detail) {
      setAnnounceDraft(detail.announcement || '');
      setPlanDraft(detail.plan_id || '');
      setNameDraft(detail.name);
    }
  }, [detail]);

  useEffect(() => {
    if (settingsOpen) {
      void Promise.all([api.plans(), api.planScopes()])
        .then(([p, s]) => {
          setPlans(p.plans);
          setPlanScopes(s.scopes);
        })
        .catch(() => {
          setPlans([]);
          setPlanScopes([]);
        });
      setGeneratedPlans(loadGeneratedPlans());
    }
  }, [settingsOpen]);

  const loadMore = async () => {
    if (!feed.length || loadingMore) return;
    setLoadingMore(true);
    try {
      const f = await api.groupFeed(gid, { before: feed[0].created_at });
      const older = Array.isArray(f.messages) ? f.messages : [];
      setFeed((prev) => [...older, ...prev]);
      setHasMore(f.has_more);
    } catch {
      /* ignore */
    } finally {
      setLoadingMore(false);
    }
  };

  const appendOptimisticCheckin = (payload: {
    ref?: string;
    task_id?: string;
    body?: string;
  }) => {
    setDetail((d) => {
      if (!d) return d;
      const members = Array.isArray(d.members)
        ? d.members.map((m) => (m.is_me ? { ...m, checked_in_today: true } : m))
        : d.members;
      return d.my_checked_in_today
        ? { ...d, members }
        : {
            ...d,
            my_checked_in_today: true,
            checked_in_today: (d.checked_in_today ?? 0) + 1,
            members,
          };
    });
    markGroupsListDirty();
    const temp: GroupMessage = {
      id: `temp-${Date.now()}`,
      author: myDisplayName(),
      mine: true,
      kind: 'checkin',
      ref: payload.ref,
      body: payload.body,
      reactions: {},
      created_at: new Date().toISOString(),
      task_id: payload.task_id,
    };
    setFeed((prev) => [...prev, temp]);
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

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
  const members = detail.members ?? [];
  const tasks = detail.tasks ?? [];
  const pinnedTask = tasks.find((t) => t.pinned || t.id === detail.pinned_task_id);
  const safeDetail = { ...detail, members, tasks };

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
    const extra = body.trim();
    const taskBody = extra
      ? `已完成任务·${taskComplete.title} · ${extra}`
      : `已完成任务·${taskComplete.title}`;
    appendOptimisticCheckin({
      task_id: taskComplete.taskId,
      ref: taskComplete.ref || undefined,
      body: taskBody,
    });
    await api.checkin(gid, {
      task_id: taskComplete.taskId,
      ref: taskComplete.ref || undefined,
      body: taskBody,
    });
    showToast('任务完成并已分享 ✓');
    await reload();
  };

  const handleCheckin = async (payload: {
    ref?: string;
    task_id?: string;
    body?: string;
  }) => {
    setBusy(true);
    appendOptimisticCheckin(payload);
    try {
      await api.checkin(gid, payload);
      showToast('打卡已发送 ✓');
      setComposerOpen(false);
      await reload();
    } catch (e) {
      await reload();
      throw e;
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
      showToast('任务已发布 ✓');
      setComposerOpen(false);
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
      setSettingsOpen(false);
      await reload();
    } catch (e) {
      alert(`保存失败：${e}`);
    } finally {
      setBusy(false);
    }
  };

  const toggleMute = async () => {
    setBusy(true);
    try {
      await api.muteGroup(gid, !detail.muted);
      showToast(detail.muted ? '已恢复本群提醒' : '已关闭本群提醒');
      await reload();
    } catch (e) {
      alert(`设置失败：${e}`);
    } finally {
      setBusy(false);
    }
  };

  const pinTask = async (tid: string) => {
    setBusy(true);
    try {
      await api.pinTask(gid, tid);
      showToast('已更新置顶任务');
      await reload();
    } catch (e) {
      alert(`置顶失败：${e}`);
    } finally {
      setBusy(false);
    }
  };

  const dissolve = async () => {
    if (!window.confirm('确定解散此共读群？所有成员将被移出，此操作不可撤销。')) return;
    setBusy(true);
    try {
      await api.dissolveGroup(gid);
      dismissPendingGroup(gid);
      markGroupsListDirty();
      router.push('/discover/groups');
    } catch (e) {
      alert(`解散失败：${e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="group-page group-page-checkin">
      <div className="group-checkin-top">
        <GroupNavBar detail={safeDetail} onOpenSettings={() => setSettingsOpen(true)} />
        <GroupTodayFocus
          gid={gid}
          detail={safeDetail}
          pinnedTask={pinnedTask}
          tasks={tasks}
          onCheckin={() => setComposerOpen(true)}
          onCompleteTask={completeTask}
        />
        <GroupCheckinWall detail={safeDetail} onOpenMembers={() => setSettingsOpen(true)} />
      </div>

      <div className="group-feed-wrap group-checkin-feed" ref={feedWrapRef}>
        <GroupActivityFeed
          gid={gid}
          messages={feed}
          isOwner={isOwner}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          onOpenComposer={() => setComposerOpen(true)}
          onReact={react}
          onReport={reportMsg}
          onDelete={deleteMsg}
          onCompleteTask={completeTask}
        />
        <div ref={feedEndRef} />
      </div>

      <GroupComposerBar disabled={busy} onOpen={() => setComposerOpen(true)} />

      <GroupComposerSheet
        open={composerOpen}
        onOpenChange={setComposerOpen}
        gid={gid}
        isOwner={isOwner}
        tasks={tasks}
        busy={busy}
        groupName={detail.name}
        onCheckin={handleCheckin}
        onCreateTask={handleCreateTask}
      />

      <GroupSettingsSheet
        open={settingsOpen}
        gid={gid}
        detail={safeDetail}
        isOwner={isOwner}
        members={members}
        tasks={tasks}
        plans={plans}
        generatedPlans={generatedPlans}
        planScopes={planScopes}
        onGeneratedPlansChange={setGeneratedPlans}
        busy={busy}
        nameDraft={nameDraft}
        planDraft={planDraft}
        announceDraft={announceDraft}
        onClose={() => setSettingsOpen(false)}
        onNameChange={setNameDraft}
        onPlanChange={setPlanDraft}
        onAnnounceChange={setAnnounceDraft}
        onSaveSettings={saveSettings}
        onPinTask={pinTask}
        onToggleMute={toggleMute}
        onDissolve={dissolve}
        onMembersChanged={reload}
      />

      {taskComplete && (
        <GroupTaskCompleteSheet
          title={taskComplete.title}
          refLabel={taskComplete.ref ? formatGroupRefLabel(taskComplete.ref) : undefined}
          onSubmit={submitTaskComplete}
          onClose={() => setTaskComplete(null)}
        />
      )}

      <GroupToast message={toast} />
    </main>
  );
}

export default function GroupPage() {
  return (
    <Suspense fallback={(
      <main className="container">
        <p className="muted">加载中…</p>
      </main>
    )}>
      <GroupPageInner />
    </Suspense>
  );
}
