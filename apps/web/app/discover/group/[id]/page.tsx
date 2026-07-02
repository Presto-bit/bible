'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { GroupChatFeed } from '@/components/group/GroupChatFeed';
import { GroupCollapsibleMeta } from '@/components/group/GroupCollapsibleMeta';
import { GroupComposerSheet } from '@/components/group/GroupComposerSheet';
import { GroupHeaderBar } from '@/components/group/GroupHeaderBar';
import { GroupIcebreakerWizard } from '@/components/group/GroupIcebreakerWizard';
import { GroupMemberAvatars } from '@/components/group/GroupMemberAvatars';
import { GroupMembersPanel } from '@/components/group/GroupMembersPanel';
import { GroupTaskCompleteSheet } from '@/components/group/GroupTaskCompleteSheet';
import { GroupTodayActionZone } from '@/components/group/GroupTodayActionZone';
import { GroupToast } from '@/components/group/GroupToast';
import { api, type GroupDetail, type GroupMessage, type PlanSummary } from '@/lib/api';
import { GROUP_CHECKIN_DEFAULT_BODY } from '@/lib/group_checkin';
import { loadFootprintRefs } from '@/lib/group_footprint';
import { myDisplayName, normalizeGroupDetail } from '@/lib/group_ui';
import { markGroupsListDirty } from '@/lib/groups_refresh';

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
  const [nudgeBusy, setNudgeBusy] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
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
      setFeed(Array.isArray(f.messages) ? f.messages : []);
      setHasMore(Boolean(f.has_more));
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
    if (searchParams.get('focus') === 'checkin') {
      setComposerOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    const el = feedWrapRef.current;
    if (!el) return;
    const onScroll = () => setHeaderScrolled(el.scrollTop > 6);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [detail]);

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
  const pendingMembers = members.filter((m) => !m.checked_in_today).length;
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

  const quickCheckin = async () => {
    if (detail.my_checked_in_today || busy) return;
    const openTask = tasks.find((t) => !t.completed);
    if (openTask) {
      completeTask(openTask.id, openTask.title, openTask.ref);
      return;
    }
    const refs = await loadFootprintRefs();
    const ref = refs[0]?.ref;
    if (!ref) {
      setComposerOpen(true);
      return;
    }
    setBusy(true);
    appendOptimisticCheckin({ ref, body: GROUP_CHECKIN_DEFAULT_BODY });
    try {
      await api.checkin(gid, { ref, body: GROUP_CHECKIN_DEFAULT_BODY });
      showToast('打卡已发送 ✓');
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
      setShowSettings(false);
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

  const nudgeMembers = async () => {
    setNudgeBusy(true);
    try {
      const r = await api.nudgeGroup(gid);
      alert(r.message || `已提醒 ${r.pending_members} 位伙伴`);
    } catch (e) {
      alert(`催打卡失败：${e}`);
    } finally {
      setNudgeBusy(false);
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
      markGroupsListDirty();
      router.push('/discover/groups');
    } catch (e) {
      alert(`解散失败：${e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="group-page">
      <div className={`group-sticky-zone${headerScrolled ? ' scrolled' : ''}`}>
        <div className="group-nav-bar">
          <Link href="/discover/groups" className="icon-btn" aria-label="返回">
            ‹
          </Link>
        </div>

        <GroupHeaderBar
          detail={safeDetail}
          scrolled={headerScrolled}
          onToggleMute={toggleMute}
          onShowMembers={() => {
            setShowMembers(true);
            setShowSettings(false);
          }}
          onShowSettings={
            isOwner
              ? () => {
                  setShowSettings((v) => !v);
                  setShowMembers(false);
                }
              : undefined
          }
        />

        {!showSettings && (
          <GroupMemberAvatars
            members={members}
            isOwner={isOwner}
            onShowMembers={() => {
              setShowMembers(true);
              setShowSettings(false);
            }}
          />
        )}
      </div>

      {showMembers && (
        <GroupMembersPanel
          gid={gid}
          members={members}
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
          {tasks.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <span className="group-composer-label">置顶任务</span>
              <div className="group-pin-list">
                {tasks.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`group-pin-item${t.pinned ? ' active' : ''}`}
                    disabled={busy}
                    onClick={() => pinTask(t.id)}
                  >
                    {t.pinned ? '📌 ' : ''}
                    {t.title}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            type="button"
            className="btn"
            style={{ width: '100%', marginTop: 8 }}
            disabled={busy}
            onClick={saveSettings}
          >
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

      {!showSettings && (
        <div className="group-page-sections">
          <div className="group-zone-header">
            <span className="group-zone-label">今日与任务</span>
            <span className="group-zone-hint muted">打卡进度、置顶任务与一键打卡</span>
          </div>
          <GroupTodayActionZone
            detail={safeDetail}
            gid={gid}
            pinnedTask={pinnedTask}
            busy={busy}
            onQuickCheckin={quickCheckin}
            onCompleteTask={completeTask}
            onOpenComposer={() => setComposerOpen(true)}
          />

          <div className="group-zone-header">
            <span className="group-zone-label">群概况</span>
            <span className="group-zone-hint muted">成员、计划与本周统计</span>
          </div>
          <GroupCollapsibleMeta
            detail={safeDetail}
            isOwner={isOwner}
            checkinsThisWeek={detail.weekly_checkins ?? 0}
            activeDays={detail.weekly_active_days ?? 0}
            pendingMembers={pendingMembers}
            nudgeBusy={nudgeBusy}
            onNudge={nudgeMembers}
            onShowMembers={() => {
              setShowMembers(true);
              setShowSettings(false);
            }}
          />

          {detail.announcement && (
            <div className="group-announcement card card-2">
              <span className="group-composer-label">群公告</span>
              <p style={{ margin: '6px 0 0', lineHeight: 1.55 }}>{detail.announcement}</p>
            </div>
          )}

          {!detail.icebreaker_done && (
            <GroupIcebreakerWizard
              busy={busy}
              onComplete={async (payload) => {
                setBusy(true);
                try {
                  await handleCheckin(payload);
                } finally {
                  setBusy(false);
                }
              }}
            />
          )}
        </div>
      )}

      <div className="group-zone-header group-zone-header-feed">
        <span className="group-zone-label">打卡动态</span>
        <span className="group-zone-hint muted">成员打卡与任务完成记录 · 点右下「+ 打卡」发感想</span>
      </div>
      <div className="group-feed-wrap" ref={feedWrapRef}>
        <GroupChatFeed
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

      {taskComplete && (
        <GroupTaskCompleteSheet
          title={taskComplete.title}
          refLabel={taskComplete.ref}
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
