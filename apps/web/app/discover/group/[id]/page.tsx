'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { GroupActivityFeed } from '@/components/group/GroupActivityFeed';
import { GroupComposerBar, type ComposerActionMode } from '@/components/group/GroupComposerBar';
import { GroupComposerSheet } from '@/components/group/GroupComposerSheet';
import { GroupNavBar } from '@/components/group/GroupNavBar';
import { GroupPageSkeleton } from '@/components/group/GroupPageSkeleton';
import { GroupSettingsSheet } from '@/components/group/GroupSettingsSheet';
import { GroupTaskCompleteSheet } from '@/components/group/GroupTaskCompleteSheet';
import { GroupCoreadStickyBar } from '@/components/group/GroupCoreadStickyBar';
import { GroupToast } from '@/components/group/GroupToast';
import { ReportSheet, type ReportReason } from '@/components/social/ReportSheet';
import ErrorBanner from '@/components/ErrorBanner';
import { api, type GeneratedPlan, type GroupDetail, type GroupMessage, type PlanSummary } from '@/lib/api';
import { recordGroupCheckin, recordGroupResponse } from '@/lib/badge_events';
import { loadGeneratedPlans } from '@/lib/generated_plans';
import { myDisplayName, normalizeGroupDetail } from '@/lib/group_ui';
import { dismissPendingGroup, markGroupsListDirty } from '@/lib/groups_refresh';
import { formatGroupRefLabel } from '@/lib/ref_label';
import { replySnippet } from '@/lib/im_ui';
import { useFocusMessage } from '@/lib/use_focus_message';
import { subscribeSocialRealtime } from '@/lib/social_realtime';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { errorMessage } from '@/lib/friendly_error';
import { hapticSuccess } from '@/lib/haptic';
import { queueCheckin } from '@/lib/checkin_queue';
import { clearGroupCheckinDraft, readGroupCheckinDraft } from '@/lib/group_checkin_draft';
import { useOnline } from '@/lib/use_online';

function GroupPageInner() {
  const confirm = useConfirm();
  const router = useRouter();
  const online = useOnline();
  const searchParams = useSearchParams();
  const focusMsg = searchParams.get('focusMsg');
  useFocusMessage(focusMsg);
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
  const [composerMode, setComposerMode] = useState<ComposerActionMode | null>(null);
  const [showJump, setShowJump] = useState(false);
  const stickBottom = useRef(true);
  const [replyTarget, setReplyTarget] = useState<{
    id: string;
    author: string;
    snippet: string;
  } | null>(null);
  const [reportMid, setReportMid] = useState<string | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [generatedPlans, setGeneratedPlans] = useState<GeneratedPlan[]>([]);
  const [announceDraft, setAnnounceDraft] = useState('');
  const [planDraft, setPlanDraft] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [taskComplete, setTaskComplete] = useState<{
    taskId: string;
    title: string;
    ref?: string | null;
    completion_rule?: string;
  } | null>(null);
  const feedWrapRef = useRef<HTMLDivElement>(null);
  const feedEndRef = useRef<HTMLDivElement>(null);
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
        router.replace('/discover');
        return;
      }
      setErr(detail);
    }
  }, [gid]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!gid) return;
    return subscribeSocialRealtime((_c, changed) => {
      if (changed) void reload();
    });
  }, [gid, reload]);

  useEffect(() => {
    if (!stickBottom.current) return;
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [feed.length]);

  useEffect(() => {
    const wrap = feedWrapRef.current;
    if (!wrap) return;
    const onScroll = () => {
      const dist = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight;
      stickBottom.current = dist < 100;
      setShowJump(dist > 140);
    };
    wrap.addEventListener('scroll', onScroll, { passive: true });
    return () => wrap.removeEventListener('scroll', onScroll);
  }, [detail]);

  useEffect(() => {
    if (searchParams.get('focus') === 'checkin') {
      setComposerMode('checkin');
    }
    const draft = readGroupCheckinDraft(gid);
    if (draft?.ref || searchParams.get('focus') === 'checkin') {
      setComposerMode('checkin');
    }
  }, [searchParams, gid]);

  useEffect(() => {
    if (detail) {
      setAnnounceDraft(detail.announcement || '');
      setPlanDraft(detail.plan_id || '');
      setNameDraft(detail.name);
    }
  }, [detail]);

  useEffect(() => {
    if (settingsOpen) {
      void api.plans()
        .then((p) => {
          setPlans(p.plans);
        })
        .catch(() => {
          setPlans([]);
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
      showToast(errorMessage(null, '加载更多失败，请稍后再试'));
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
        <ErrorBanner message={errorMessage(err, '群加载失败')} onRetry={() => void reload()} />
      </main>
    );
  }
  if (!detail) {
    return (
      <main className="group-page group-page-checkin container">
        <GroupPageSkeleton />
      </main>
    );
  }

  const isOwner = detail.role === 'owner';
  const isStaff = detail.role === 'owner' || detail.role === 'admin';
  const allowChat = detail.allow_chat !== false;
  const members = detail.members ?? [];
  const tasks = detail.tasks ?? [];
  const safeDetail = { ...detail, members, tasks };

  const react = async (mid: string, emoji: string) => {
    try {
      await api.react(mid, emoji);
      recordGroupResponse();
      reload();
    } catch {
      showToast(errorMessage(null, '反应发送失败，请稍后再试'));
    }
  };

  const reportMsg = (mid: string) => {
    setReportMid(mid);
  };

  const submitReport = async (reason: ReportReason) => {
    if (!reportMid) return;
    setReportBusy(true);
    try {
      await api.reportContent('group_message', reportMid, reason);
      setReportMid(null);
      showToast(reason === 'heresy' ? '已提交异端举报，将优先复核' : '已举报，感谢反馈');
    } catch (e) {
      showToast(errorMessage(e, '举报失败，请稍后再试'));
    } finally {
      setReportBusy(false);
    }
  };

  const deleteMsg = async (mid: string) => {
    const ok = await confirm({
      title: '删除内容',
      message: '确定删除这条内容？',
      confirmLabel: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteMessage(mid);
      reload();
    } catch (e) {
      showToast(errorMessage(e, '删除失败，请稍后再试'));
    }
  };

  const completeTask = (taskId: string, title: string, ref?: string | null) => {
    const task = tasks.find((t) => t.id === taskId);
    setTaskComplete({
      taskId,
      title: task?.title || title,
      ref: task?.ref ?? ref,
      completion_rule: task?.completion_rule || 'checkin_text',
    });
  };

  const submitTaskComplete = async (body: string) => {
    if (!taskComplete) return;
    const rule = taskComplete.completion_rule || 'checkin_text';
    const extra = body.trim();
    let taskBody: string | undefined;
    if (rule === 'tap' || rule === 'read_done') {
      taskBody = extra || undefined;
    } else if (extra) {
      taskBody = `已完成任务·${taskComplete.title} · ${extra}`;
    } else {
      taskBody = `已完成任务·${taskComplete.title}`;
    }
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
    recordGroupCheckin(gid);
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
      recordGroupCheckin(gid);
      clearGroupCheckinDraft(gid);
      hapticSuccess();
      showToast('打卡已发送 ✓');
      setComposerMode(null);
      await reload();
    } catch (e) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        queueCheckin(gid, payload);
        clearGroupCheckinDraft(gid);
        hapticSuccess();
        showToast('已离线保存，联网后自动发送');
        setComposerMode(null);
        return;
      }
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
    task_type?: string;
    completion_rule?: string;
    body?: string;
    publish_at?: string;
    assignee_ids?: string[];
    attachments?: Array<{
      file_name: string;
      mime_type: string;
      size_bytes: number;
      storage_path: string;
      url: string;
    }>;
    series_days?: number;
    series_due_hours?: number;
  }) => {
    setBusy(true);
    try {
      const res = await api.createTask(gid, payload.title, payload.ref, {
        due_at: payload.due_at,
        template_id: payload.template_id,
        task_type: payload.task_type,
        completion_rule: payload.completion_rule,
        body: payload.body,
        publish_at: payload.publish_at,
        assignee_ids: payload.assignee_ids,
        attachments: payload.attachments,
        series_days: payload.series_days,
        series_due_hours: payload.series_due_hours,
      });
      if (res.series) {
        showToast(`系列任务已创建（${res.task_ids?.length || payload.series_days} 天）✓`);
      } else if (payload.publish_at && new Date(payload.publish_at).getTime() > Date.now()) {
        showToast('任务已预约发布 ✓');
      } else {
        showToast('任务已发布 ✓');
      }
      setComposerMode(null);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const appendOptimisticChat = (payload: {
    body?: string;
    kind?: string;
    reply_to_id?: string;
  }) => {
    const temp: GroupMessage = {
      id: `temp-${Date.now()}`,
      author: myDisplayName(),
      mine: true,
      kind: payload.kind || 'chat',
      body: payload.body,
      reactions: {},
      created_at: new Date().toISOString(),
      reply_to_id: payload.reply_to_id || null,
      pending: true,
    };
    setFeed((prev) => [...prev, temp]);
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    return temp.id;
  };

  const markOptimisticFailed = (tempId: string) => {
    setFeed((prev) =>
      prev.map((m) => (m.id === tempId ? { ...m, pending: false, sendFailed: true } : m)),
    );
  };

  const handleChat = async (
    body: string,
    opts?: { mentions?: string[]; replyToId?: string },
  ) => {
    if (!online) {
      showToast('闲聊需联网发送');
      throw new Error('离线');
    }
    setBusy(true);
    const tempId = appendOptimisticChat({
      body,
      reply_to_id: opts?.replyToId,
    });
    try {
      await api.sendGroupChat(gid, body, {
        mentions: opts?.mentions,
        replyToId: opts?.replyToId,
      });
      setReplyTarget(null);
      setComposerMode(null);
      await reload();
    } catch (e) {
      markOptimisticFailed(tempId);
      showToast(errorMessage(e, '发送失败'));
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const handleChatMedia = async (payload: {
    storage_key: string;
    file_name: string;
    mime_type: string;
    size_bytes: number;
    url: string;
    body?: string;
    mentions?: string[];
    reply_to_id?: string;
  }) => {
    if (!online) {
      showToast('闲聊需联网发送');
      throw new Error('离线');
    }
    setBusy(true);
    const kind = (payload.mime_type || '').startsWith('image/') ? 'image' : 'file';
    const tempId = appendOptimisticChat({
      body: payload.body,
      kind,
      reply_to_id: payload.reply_to_id,
    });
    try {
      await api.sendGroupMedia(gid, {
        storage_key: payload.storage_key,
        file_name: payload.file_name,
        mime: payload.mime_type,
        size_bytes: payload.size_bytes,
        url: payload.url,
        body: payload.body,
        mentions: payload.mentions,
        reply_to_id: payload.reply_to_id,
      });
      setReplyTarget(null);
      setComposerMode(null);
      await reload();
    } catch (e) {
      markOptimisticFailed(tempId);
      showToast(errorMessage(e, '发送失败'));
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const recallMsg = async (mid: string) => {
    try {
      await api.recallMessage(mid);
      showToast('已撤回');
      await reload();
    } catch (e) {
      showToast(errorMessage(e, '撤回失败'));
    }
  };

  const startReply = (m: GroupMessage) => {
    setReplyTarget({
      id: m.id,
      author: m.mine ? '我' : m.author || '群友',
      snippet: replySnippet(m.body, m.kind, m.attachments?.[0]?.file_name),
    });
  };

  const saveSettings = async () => {
    setBusy(true);
    try {
      await api.updateGroup(gid, {
        ...(isOwner ? { name: nameDraft.trim() } : {}),
        announcement: announceDraft,
        ...(planDraft ? { plan_id: planDraft } : { clear_plan: true }),
      });
      setSettingsOpen(false);
      await reload();
    } catch (e) {
      showToast(errorMessage(e, '保存失败，请稍后再试'));
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
      showToast(errorMessage(e, '设置失败，请稍后再试'));
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
      showToast(errorMessage(e, '置顶失败，请稍后再试'));
    } finally {
      setBusy(false);
    }
  };

  const dissolve = async () => {
    const ok = await confirm({
      title: '解散共读群',
      message: '确定解散此共读群？所有成员将被移出，此操作不可撤销。',
      confirmLabel: '解散',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.dissolveGroup(gid);
      dismissPendingGroup(gid);
      markGroupsListDirty();
      router.push('/discover');
    } catch (e) {
      showToast(errorMessage(e, '解散失败，请稍后再试'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="group-page group-page-checkin">
      <div className="group-checkin-nav-fixed">
        <GroupNavBar detail={safeDetail} onOpenSettings={() => setSettingsOpen(true)} />
      </div>

      <div className="group-checkin-scroll" ref={feedWrapRef}>
        <GroupCoreadStickyBar
          detail={safeDetail}
          tasks={tasks}
          onCheckin={() => setComposerMode('checkin')}
        />
        {!online ? (
          <p className="muted offline-page-hint" style={{ padding: '0 16px' }}>
            当前离线：打卡可排队，闲聊需联网。
          </p>
        ) : null}
        <div className="group-feed-wrap group-checkin-feed-inner group-chat-feed-wrap">
          <GroupActivityFeed
            gid={gid}
            messages={feed}
            isOwner={isStaff}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={loadMore}
            onOpenComposer={() => setComposerMode('checkin')}
            onReact={react}
            onReport={reportMsg}
            onDelete={deleteMsg}
            onReply={allowChat ? startReply : undefined}
            onRecall={recallMsg}
            onCompleteTask={completeTask}
            onResend={(m) => {
              if (!m.body || m.kind !== 'chat') return;
              setFeed((prev) => prev.filter((x) => x.id !== m.id));
              void handleChat(m.body, {
                replyToId: m.reply_to_id || undefined,
                mentions: m.mentions,
              });
            }}
          />
          <div ref={feedEndRef} />
        </div>
      </div>

      {showJump ? (
        <button
          type="button"
          className="im-jump-bottom"
          onClick={() => {
            stickBottom.current = true;
            setShowJump(false);
            feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          回到底部
        </button>
      ) : null}

      <GroupComposerBar
        gid={gid}
        disabled={busy}
        busy={busy}
        online={online}
        allowChat={allowChat}
        canPostTask={isStaff}
        members={members}
        replyTo={replyTarget}
        onClearReply={() => setReplyTarget(null)}
        onRestoreReply={(r) => setReplyTarget(r)}
        onOpenMode={(mode) => setComposerMode(mode)}
        onChat={handleChat}
        onChatMedia={handleChatMedia}
      />

      <GroupComposerSheet
        open={composerMode != null}
        mode={composerMode || 'checkin'}
        onOpenChange={(open) => {
          if (!open) setComposerMode(null);
        }}
        gid={gid}
        isOwner={isOwner}
        canPostTask={isStaff}
        allowChat={false}
        tasks={tasks}
        members={members}
        busy={busy}
        groupName={detail.name}
        onCheckin={handleCheckin}
        onCreateTask={handleCreateTask}
        onOpenSettings={() => {
          setComposerMode(null);
          setSettingsOpen(true);
        }}
      />

      <GroupSettingsSheet
        open={settingsOpen}
        gid={gid}
        detail={safeDetail}
        isOwner={isOwner}
        isStaff={isStaff}
        members={members}
        tasks={tasks}
        plans={plans}
        generatedPlans={generatedPlans}
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
        onDetailChanged={reload}
      />

      {taskComplete && (
        <GroupTaskCompleteSheet
          title={taskComplete.title}
          refLabel={taskComplete.ref ? formatGroupRefLabel(taskComplete.ref) : undefined}
          completionRule={taskComplete.completion_rule}
          onSubmit={submitTaskComplete}
          onClose={() => setTaskComplete(null)}
        />
      )}

      <ReportSheet
        open={Boolean(reportMid)}
        busy={reportBusy}
        onClose={() => setReportMid(null)}
        onSubmit={submitReport}
      />

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
