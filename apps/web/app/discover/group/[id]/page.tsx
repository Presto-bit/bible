'use client';

import { Suspense, startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { GroupActivityFeed } from '@/components/group/GroupActivityFeed';
import { GroupMemberProfileSheet } from '@/components/group/GroupMemberProfileSheet';
import { GroupComposerBar, type ComposerActionMode } from '@/components/group/GroupComposerBar';
import { GroupComposerSheet } from '@/components/group/GroupComposerSheet';
import { GroupNavBar } from '@/components/group/GroupNavBar';
import { GroupPageSkeleton } from '@/components/group/GroupPageSkeleton';
import { GroupSettingsSheet, type GroupSettingsPane } from '@/components/group/GroupSettingsSheet';
import { GroupPrayerSheet } from '@/components/group/GroupPrayerSheet';
import { GroupPrayerBanner } from '@/components/group/GroupPrayerBanner';
import { GroupTaskCompleteSheet } from '@/components/group/GroupTaskCompleteSheet';
import { GroupCoreadStickyBar } from '@/components/group/GroupCoreadStickyBar';
import { GroupMyTaskPin } from '@/components/group/GroupMyTaskPin';
import { GroupProfileCard } from '@/components/group/GroupProfileCard';
import { GroupCheckinWallSheet } from '@/components/group/GroupCheckinWallSheet';
import { GroupInviteSheet } from '@/components/group/GroupInviteSheet';
import { GroupAnnounceBar } from '@/components/group/GroupAnnounceBar';
import { GroupPinnedTaskBar } from '@/components/group/GroupPinnedTaskBar';
import { GroupToast } from '@/components/group/GroupToast';
import { ReportSheet, type ReportReason } from '@/components/social/ReportSheet';
import { ForwardPickerSheet, type ForwardPayload } from '@/components/social/ForwardPickerSheet';
import { ImChatSearch } from '@/components/social/ImChatSearch';
import ErrorBanner from '@/components/ErrorBanner';
import { api, effectiveId, type GeneratedPlan, type GroupDetail, type GroupMember, type GroupMessage, type PlanSummary } from '@/lib/api';
import { scrollImChatToBottom } from '@/lib/use_im_composer_keyboard';
import { recordGroupCheckin, recordGroupResponse } from '@/lib/badge_events';
import { requestInviteNudge } from '@/lib/invite_nudge';
import { loadGeneratedPlans } from '@/lib/generated_plans';
import { asGroupMembers, displayMemberName, myDisplayName, normalizeGroupDetail } from '@/lib/group_ui';
import { friendRemarkOrName } from '@/lib/friend_remarks';
import { dismissPendingGroup, markGroupsListDirty } from '@/lib/groups_refresh';
import { formatGroupRefLabel } from '@/lib/ref_label';
import { replySnippet } from '@/lib/im_ui';
import { detectImMediaKind } from '@/lib/im_av';
import { useFocusMessage } from '@/lib/use_focus_message';
import { subscribeSocialRealtime } from '@/lib/social_realtime';
import { keepIfSameMessageList, mergeImMessageTail, runReloadGate, type ReloadGate } from '@/lib/im_list_perf';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { errorMessage } from '@/lib/friendly_error';
import { hapticSuccess } from '@/lib/haptic';
import { queueCheckin } from '@/lib/checkin_queue';
import { clearGroupCheckinDraft, readGroupCheckinDraft } from '@/lib/group_checkin_draft';
import { enqueueFailedMediaMeta, dequeueFailedMediaMeta, listFailedMediaMeta, takeMediaFile, enqueueFailedText, dequeueFailedText, listFailedText } from '@/lib/im_send_queue';
import { useOnline } from '@/lib/use_online';

function GroupPageInner() {
  const confirm = useConfirm();
  const router = useRouter();
  const online = useOnline();
  const searchParams = useSearchParams();
  const focusMsg = searchParams.get('focusMsg');
  const [focusOverride, setFocusOverride] = useState<string | null>(null);
  const activeFocus = focusOverride || focusMsg;
  const [searchOpen, setSearchOpen] = useState(false);
  const [forwardItems, setForwardItems] = useState<ForwardPayload[] | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [profileMember, setProfileMember] = useState<GroupMember | null>(null);
  const [mentionSeed, setMentionSeed] = useState<{ id: string; label: string } | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const hasMoreRef = useRef(false);
  const feedRef = useRef<GroupMessage[]>([]);
  const loadingMoreRef = useRef(false);
  const markedReadRef = useRef(false);
  const params = useParams<{ id: string }>();
  const rawId = params.id;
  const gid = Array.isArray(rawId) ? rawId[0] : rawId ?? '';
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [feed, setFeed] = useState<GroupMessage[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPane, setSettingsPane] = useState<GroupSettingsPane>('home');
  const [prayerOpen, setPrayerOpen] = useState(false);
  const [prayerCompose, setPrayerCompose] = useState(false);
  const [prayerPending, setPrayerPending] = useState<{ count: number; title: string | null }>({
    count: 0,
    title: null,
  });
  const [prayerBannerDismissed, setPrayerBannerDismissed] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [wallOpen, setWallOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<ComposerActionMode | null>(null);
  const [showJump, setShowJump] = useState(false);
  const [jumpUnread, setJumpUnread] = useState(0);
  const stickBottom = useRef(true);
  const bottomMsgIdRef = useRef<string | null>(null);
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
  const feedReloadGate = useRef<ReloadGate>({ busy: false, queued: false });

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
        if (!temps.length) return keepIfSameMessageList(prev, incoming);
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
        return keepIfSameMessageList(prev, merged);
      });
      setHasMore(Boolean(f.has_more));
      hasMoreRef.current = Boolean(f.has_more);
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
  }, [gid, router]);

  /** realtime 热路径：只刷消息流，避免反复打重型 group_detail */
  const reloadFeed = useCallback(async () => {
    if (!gid) return;
    await runReloadGate(feedReloadGate.current, async () => {
      try {
        const f = await api.groupFeed(gid);
        const incoming = Array.isArray(f.messages) ? f.messages : [];
        startTransition(() => {
          setFeed((prev) => mergeImMessageTail(prev, incoming));
          // 仅当尚未翻页时用服务端 has_more；已 loadMore 则保留本地 hasMore
          if (!hasMoreRef.current || feedRef.current.length <= incoming.length + 2) {
            hasMoreRef.current = Boolean(f.has_more);
            setHasMore(Boolean(f.has_more));
          }
          setErr(null);
        });
      } catch {
        /* 静默：下次可见时再全量 */
      }
    });
  }, [gid]);

  const prayerPendingCountRef = useRef(0);
  const refreshPrayerPending = useCallback(async () => {
    if (!gid) return;
    try {
      const r = await api.listGroupPrayers(gid, 'open');
      const pending = (r.items || []).filter((it) => !it.claimed_by_me);
      const nextCount = pending.length;
      if (nextCount === 0 || nextCount > prayerPendingCountRef.current) {
        setPrayerBannerDismissed(false);
      }
      prayerPendingCountRef.current = nextCount;
      setPrayerPending({
        count: nextCount,
        title: pending[0]?.title || null,
      });
    } catch {
      prayerPendingCountRef.current = 0;
      setPrayerPending({ count: 0, title: null });
    }
  }, [gid]);

  useEffect(() => {
    markedReadRef.current = false;
  }, [gid]);

  const markGroupRead = useCallback(() => {
    if (!gid || markedReadRef.current) return;
    markedReadRef.current = true;
    void import('@/lib/discover_unread').then((m) => m.notifyDiscoverUnreadChanged());
    void api.patchConversationState('group', gid, {}).catch(() => {
      markedReadRef.current = false;
    });
  }, [gid]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    markGroupRead();
  }, [markGroupRead]);

  /** 刷新后恢复失败文本 / 媒体气泡 */
  useEffect(() => {
    if (!gid) return;
    const textQueued = listFailedText('group', gid);
    const mediaQueued = listFailedMediaMeta('group', gid);
    if (!textQueued.length && !mediaQueued.length) return;
    setFeed((prev) => {
      const have = new Set(prev.map((m) => m.id));
      const extras: GroupMessage[] = [];
      for (const q of textQueued) {
        if (have.has(q.id)) continue;
        extras.push({
          id: q.id,
          author: myDisplayName(detail?.members),
          mine: true,
          kind: 'chat',
          body: q.body,
          reactions: {},
          created_at: new Date().toISOString(),
          reply_to_id: q.replyToId || null,
          mentions: q.mentions,
          pending: false,
          sendFailed: true,
        });
      }
      for (const q of mediaQueued) {
        if (have.has(q.id)) continue;
        extras.push({
          id: q.id,
          author: myDisplayName(detail?.members),
          mine: true,
          kind: q.kind || detectImMediaKind(q.mime, q.file_name) || 'file',
          body: q.body,
          reactions: {},
          created_at: new Date().toISOString(),
          reply_to_id: q.replyToId || null,
          pending: false,
          sendFailed: true,
          retryMedia: {
            storage_key: q.storage_key,
            file_name: q.file_name,
            mime: q.mime,
            size_bytes: q.size_bytes,
            url: q.url,
            body: q.body,
            reply_to_id: q.replyToId,
            mentions: q.mentions,
          },
        });
      }
      return extras.length ? [...prev, ...extras] : prev;
    });
  }, [gid, detail?.members]);

  useEffect(() => {
    void refreshPrayerPending();
    setPrayerBannerDismissed(false);
  }, [refreshPrayerPending]);

  const openPrayer = useCallback((opts?: { compose?: boolean }) => {
    setPrayerCompose(Boolean(opts?.compose));
    setPrayerOpen(true);
  }, []);

  useEffect(() => {
    if (!gid) return;
    return subscribeSocialRealtime(
      (_c, changed) => {
        if (!changed) return;
        markedReadRef.current = false;
        void reloadFeed().then(() => markGroupRead());
      },
      { watch: 'group', debounceMs: 400 },
    );
  }, [gid, reloadFeed, markGroupRead]);

  // 回到前台时轻量补一次 detail（任务/成员），并刷新已读
  useEffect(() => {
    if (!gid) return;
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      markedReadRef.current = false;
      markGroupRead();
      void api.groupDetail(gid, { light: true }).then((d) => {
        setDetail(normalizeGroupDetail(d));
      }).catch(() => {});
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [gid, markGroupRead]);

  const groupInitialPinned = useRef(false);
  useEffect(() => {
    groupInitialPinned.current = false;
  }, [gid]);

  useEffect(() => {
    if (!feed.length) return;
    if (searchParams.get('focusMsg')) return;
    if (!groupInitialPinned.current) {
      groupInitialPinned.current = true;
      stickBottom.current = true;
      scrollImChatToBottom(feedWrapRef.current);
      return;
    }
    if (!stickBottom.current) return;
    scrollImChatToBottom(feedWrapRef.current);
  }, [feed.length, searchParams]);

  useEffect(() => {
    const wrap = feedWrapRef.current;
    if (!wrap) return;
    const onScroll = () => {
      const dist = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight;
      stickBottom.current = dist < 100;
      if (stickBottom.current) setJumpUnread(0);
      const nextJump = dist > 140;
      setShowJump((prev) => (prev === nextJump ? prev : nextJump));
    };
    wrap.addEventListener('scroll', onScroll, { passive: true });
    return () => wrap.removeEventListener('scroll', onScroll);
  }, [detail]);

  useEffect(() => {
    const last = feed[feed.length - 1];
    if (!last) return;
    const prevId = bottomMsgIdRef.current;
    bottomMsgIdRef.current = last.id;
    if (!prevId || prevId === last.id) return;
    if (stickBottom.current) {
      setJumpUnread(0);
      return;
    }
    if (!last.mine && !last.id.startsWith('temp-')) {
      setJumpUnread((n) => n + 1);
      setShowJump(true);
    }
  }, [feed]);

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
    if (searchParams.get('focus') !== 'taskComplete' || !detail) return;
    const taskId = searchParams.get('taskId');
    const tasksList = Array.isArray(detail.tasks) ? detail.tasks : [];
    const task = taskId
      ? tasksList.find((t) => t.id === taskId)
      : tasksList.find((t) => !t.completed && (t.id === detail.pinned_task_id || t.pinned))
        || tasksList.find((t) => !t.completed);
    if (!task || task.completed) return;
    setTaskComplete({
      taskId: task.id,
      title: task.title,
      ref: task.ref,
      completion_rule: task.completion_rule,
    });
    if (typeof window !== 'undefined') {
      const u = new URL(window.location.href);
      u.searchParams.delete('focus');
      u.searchParams.delete('taskId');
      window.history.replaceState({}, '', `${u.pathname}${u.search}`);
    }
  }, [searchParams, detail]);

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

  const loadMore = useCallback(async (): Promise<boolean> => {
    if (loadingMoreRef.current) return hasMoreRef.current;
    const cur = feedRef.current;
    if (!cur.length || !hasMoreRef.current) return false;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const f = await api.groupFeed(gid, { before: cur[0]!.created_at });
      const older = Array.isArray(f.messages) ? f.messages : [];
      setFeed((prev) => {
        const next = [...older, ...prev];
        feedRef.current = next;
        return next;
      });
      hasMoreRef.current = Boolean(f.has_more);
      setHasMore(Boolean(f.has_more));
      return Boolean(f.has_more);
    } catch {
      showToast(errorMessage(null, '加载更多失败，请稍后再试'));
      return hasMoreRef.current;
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [gid, showToast]);

  useFocusMessage(activeFocus, { loadOlder: loadMore });

  useEffect(() => {
    feedRef.current = feed;
  }, [feed]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

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
      author: myDisplayName(detail?.members),
      mine: true,
      kind: 'checkin',
      ref: payload.ref,
      body: payload.body,
      reactions: {},
      created_at: new Date().toISOString(),
      task_id: payload.task_id,
    };
    setFeed((prev) => [...prev, temp]);
    stickBottom.current = true;
    scrollImChatToBottom(feedWrapRef.current);
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

  const submitReport = async (reason: ReportReason, detail?: string) => {
    if (!reportMid) return;
    setReportBusy(true);
    try {
      await api.reportContent('group_message', reportMid, reason, detail);
      setReportMid(null);
      showToast(reason === 'heresy' ? '已提交异端举报，将优先复核' : '已举报，感谢反馈');
    } catch (e) {
      showToast(errorMessage(e, '举报失败，请稍后再试'));
    } finally {
      setReportBusy(false);
    }
  };

  const deleteMsg = async (mid: string) => {
    const local = feed.find((m) => m.id === mid);
    if (mid.startsWith('temp-') || local?.sendFailed) {
      dequeueFailedMediaMeta(mid);
      dequeueFailedText(mid);
      takeMediaFile(mid);
      setFeed((prev) => prev.filter((x) => x.id !== mid));
      return;
    }
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
    requestInviteNudge(1600);
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
      void import('@/lib/home_liveness').then((m) => m.markCheckinFlash());
      showToast('打卡已发送 ✓');
      requestInviteNudge(1600);
      setComposerMode(null);
      await reload();
    } catch (e) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        queueCheckin(gid, payload);
        clearGroupCheckinDraft(gid);
        hapticSuccess();
        void import('@/lib/home_liveness').then((m) => m.markCheckinFlash());
        showToast('已离线保存，联网后自动发送');
        requestInviteNudge(1600);
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
      author: myDisplayName(detail?.members),
      mine: true,
      kind: payload.kind || 'chat',
      body: payload.body,
      reactions: {},
      created_at: new Date().toISOString(),
      reply_to_id: payload.reply_to_id || null,
      pending: true,
    };
    setFeed((prev) => [...prev, temp]);
    stickBottom.current = true;
    scrollImChatToBottom(feedWrapRef.current);
    return temp.id;
  };

  const markOptimisticFailed = (
    tempId: string,
    retryMedia?: GroupMessage['retryMedia'],
  ) => {
    setFeed((prev) =>
      prev.map((m) =>
        m.id === tempId
          ? { ...m, pending: false, sendFailed: true, retryMedia: retryMedia || m.retryMedia }
          : m,
      ),
    );
  };

  const handleChat = async (
    body: string,
    opts?: { mentions?: string[]; replyToId?: string },
  ) => {
    if (!online) {
      showToast('当前离线，联网后再发送');
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
        clientMsgId: tempId,
      });
      dequeueFailedText(tempId);
      setReplyTarget(null);
      setComposerMode(null);
      await reload();
    } catch (e) {
      enqueueFailedText({
        id: tempId,
        scope: 'group',
        refId: gid,
        body,
        replyToId: opts?.replyToId,
        mentions: opts?.mentions,
        kind: 'chat',
      });
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
      showToast('当前离线，联网后再发送');
      throw new Error('离线');
    }
    setBusy(true);
    const kind = detectImMediaKind(payload.mime_type, payload.file_name) || 'file';
    const tempId = appendOptimisticChat({
      body: payload.body,
      kind,
      reply_to_id: payload.reply_to_id,
    });
    const retryMedia = {
      storage_key: payload.storage_key,
      file_name: payload.file_name,
      mime: payload.mime_type,
      size_bytes: payload.size_bytes,
      url: payload.url,
      body: payload.body,
      reply_to_id: payload.reply_to_id,
      mentions: payload.mentions,
    };
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
      dequeueFailedMediaMeta(tempId);
      setReplyTarget(null);
      setComposerMode(null);
      await reload();
    } catch (e) {
      enqueueFailedMediaMeta({
        id: tempId,
        scope: 'group',
        refId: gid,
        kind,
        ...retryMedia,
      });
      markOptimisticFailed(tempId, retryMedia);
      showToast(errorMessage(e, '发送失败'));
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const resendGroupMessage = async (m: GroupMessage) => {
    if (m.kind === 'chat' && m.body) {
      setFeed((prev) =>
        prev.map((x) => (x.id === m.id ? { ...x, pending: true, sendFailed: false } : x)),
      );
      try {
        await api.sendGroupChat(gid, m.body, {
          replyToId: m.reply_to_id || undefined,
          mentions: m.mentions,
          clientMsgId: m.id,
        });
        dequeueFailedText(m.id);
        setFeed((prev) => prev.filter((x) => x.id !== m.id));
        await reload();
      } catch (e) {
        enqueueFailedText({
          id: m.id,
          scope: 'group',
          refId: gid,
          body: m.body,
          replyToId: m.reply_to_id || undefined,
          mentions: m.mentions,
          kind: 'chat',
        });
        markOptimisticFailed(m.id);
        showToast(errorMessage(e, '重发失败'));
      }
      return;
    }
    const meta = m.retryMedia;
    if (!meta?.storage_key) return;
    setBusy(true);
    setFeed((prev) =>
      prev.map((x) => (x.id === m.id ? { ...x, pending: true, sendFailed: false } : x)),
    );
    try {
      await api.sendGroupMedia(gid, {
        storage_key: meta.storage_key,
        file_name: meta.file_name,
        mime: meta.mime,
        size_bytes: meta.size_bytes,
        url: meta.url,
        body: meta.body,
        mentions: meta.mentions,
        reply_to_id: meta.reply_to_id,
      });
      dequeueFailedMediaMeta(m.id);
      await reload();
    } catch (e) {
      markOptimisticFailed(m.id, meta);
      showToast(errorMessage(e, '重发失败'));
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
      snippet: replySnippet(m.body, m.kind, m.attachments?.[0]?.file_name, m.ref),
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

  const openSettings = (pane: GroupSettingsPane = 'home') => {
    setSettingsPane(pane);
    setSettingsOpen(true);
  };

  const myOpenTask =
    tasks.find((t) => t.id === safeDetail.pinned_task_id && !t.completed)
    || tasks.find((t) => t.pinned && !t.completed)
    || tasks.find((t) => !t.completed);

  const invitePlanDayLine = safeDetail.plan_title
    ? safeDetail.plan_days_total
      ? `${safeDetail.plan_title} · 我第 ${safeDetail.my_plan_day ?? 0}/${safeDetail.plan_days_total} 天`
      : safeDetail.plan_title
    : null;

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelect = (mid: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(mid)) next.delete(mid);
      else next.add(mid);
      return next;
    });
  };

  const forwardSelected = () => {
    const items: ForwardPayload[] = [];
    const byId = new Map(feed.map((m) => [m.id, m]));
    for (const id of selectedIds) {
      const m = byId.get(id);
      if (!m || m.recalled) continue;
      items.push({
        body: m.body,
        kind: m.kind,
        ref: m.ref,
        attachments: m.attachments?.map((a) => ({
          url: a.url,
          file_name: a.file_name,
          mime: a.mime,
        })),
      });
    }
    if (!items.length) return;
    setForwardItems(items);
    exitSelectMode();
  };

  const deleteSelected = async () => {
    if (!selectedIds.size) return;
    if (!window.confirm(`删除已选 ${selectedIds.size} 条消息？`)) return;
    const ids = [...selectedIds];
    exitSelectMode();
    for (const id of ids) {
      await deleteMsg(id);
    }
  };

  return (
    <main className="group-page group-page-checkin">
      <div className="group-checkin-nav-fixed">
        <GroupNavBar
          detail={safeDetail}
          onOpenCard={() => setCardOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenSettings={() => openSettings('home')}
        />
        {selectMode ? (
          <div className="im-select-toolbar">
            <button type="button" className="text-link" onClick={exitSelectMode}>
              取消
            </button>
            <span className="muted">已选 {selectedIds.size} 条</span>
            <span className="im-select-toolbar-spacer" aria-hidden />
          </div>
        ) : (
          <GroupAnnounceBar
            text={safeDetail.announcement || ''}
            onOpen={() => openSettings('profile')}
          />
        )}
      </div>

      <div className="group-checkin-scroll" ref={feedWrapRef}>
        {(() => {
          const pinned =
            tasks.find((t) => t.id === safeDetail.pinned_task_id)
            || tasks.find((t) => t.pinned);
          return pinned ? (
            <GroupPinnedTaskBar
              gid={gid}
              task={pinned}
              onComplete={(taskId, title, ref) => {
                setTaskComplete({
                  taskId,
                  title,
                  ref,
                  completion_rule: pinned.completion_rule,
                });
              }}
            />
          ) : null;
        })()}
        <GroupCoreadStickyBar
          detail={safeDetail}
          tasks={tasks}
          onCheckin={() => setComposerMode('checkin')}
          onOpenWall={() => setWallOpen(true)}
          onOpenCard={() => setCardOpen(true)}
          onGoTask={() => {
            if (!myOpenTask) return;
            setTaskComplete({
              taskId: myOpenTask.id,
              title: myOpenTask.title,
              ref: myOpenTask.ref,
              completion_rule: myOpenTask.completion_rule,
            });
          }}
        />
        {!prayerBannerDismissed && prayerPending.count > 0 ? (
          <GroupPrayerBanner
            count={prayerPending.count}
            previewTitle={prayerPending.title}
            onOpen={() => openPrayer()}
            onDismiss={() => setPrayerBannerDismissed(true)}
          />
        ) : null}
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
            members={asGroupMembers(detail.members)}
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
            scrollParentRef={feedWrapRef}
            focusMsgId={activeFocus}
            selectMode={selectMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onEnterSelect={(mid) => {
              setSelectMode(true);
              setSelectedIds(new Set([mid]));
            }}
            onResend={(m) => {
              void resendGroupMessage(m);
            }}
            onForward={(m) => {
              setForwardItems([
                {
                  body: m.body,
                  kind: m.kind,
                  ref: m.ref,
                  attachments: m.attachments?.map((a) => ({
                    url: a.url,
                    file_name: a.file_name,
                    mime: a.mime,
                  })),
                },
              ]);
            }}
            onMemberClick={(member) => setProfileMember(member)}
          />
          <div ref={feedEndRef} />
        </div>
      </div>

      {showJump ? (
        <button
          type="button"
          className={`im-jump-bottom${selectMode ? ' is-selecting' : ''}${jumpUnread > 0 ? ' has-unread' : ''}`}
          onClick={() => {
            stickBottom.current = true;
            setShowJump(false);
            setJumpUnread(0);
            scrollImChatToBottom(feedWrapRef.current);
          }}
        >
          回到底部
          {jumpUnread > 0 ? (
            <span className="im-jump-badge">{jumpUnread > 99 ? '99+' : jumpUnread}</span>
          ) : null}
        </button>
      ) : null}

      {myOpenTask && !selectMode ? (
        <GroupMyTaskPin
          gid={gid}
          task={myOpenTask}
          onComplete={(taskId, title, ref) => {
            setTaskComplete({
              taskId,
              title,
              ref,
              completion_rule: myOpenTask.completion_rule,
            });
          }}
        />
      ) : null}

      <GroupComposerBar
        gid={gid}
        disabled={busy || selectMode}
        busy={busy}
        online={online}
        allowChat={allowChat && !selectMode}
        canPostTask={isStaff}
        members={members}
        replyTo={replyTarget}
        onClearReply={() => setReplyTarget(null)}
        onRestoreReply={(r) => setReplyTarget(r)}
        onOpenMode={(mode) => setComposerMode(mode)}
        onOpenPrayer={openPrayer}
        onChat={handleChat}
        onChatMedia={handleChatMedia}
        getScrollEl={() => feedWrapRef.current}
        selectMode={selectMode}
        selectedCount={selectedIds.size}
        onForwardSelected={forwardSelected}
        onDeleteSelected={() => void deleteSelected()}
        externalMention={mentionSeed}
        onExternalMentionHandled={() => setMentionSeed(null)}
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
          openSettings('home');
        }}
      />

      <GroupProfileCard
        open={cardOpen}
        groupId={gid}
        detail={safeDetail}
        tasks={tasks}
        messages={feed}
        isOwner={isOwner}
        isStaff={isStaff}
        onClose={() => setCardOpen(false)}
        onCheckin={() => {
          setCardOpen(false);
          setComposerMode('checkin');
        }}
        onInvite={() => {
          setCardOpen(false);
          setInviteOpen(true);
        }}
        onOpenSettings={() => {
          setCardOpen(false);
          openSettings('home');
        }}
        onOpenMembers={() => {
          setCardOpen(false);
          openSettings('members');
        }}
        onCompleteTask={(taskId, title, ref) => {
          setCardOpen(false);
          const t = tasks.find((x) => x.id === taskId);
          setTaskComplete({
            taskId,
            title,
            ref,
            completion_rule: t?.completion_rule,
          });
        }}
        onReact={react}
      />

      <GroupCheckinWallSheet
        open={wallOpen}
        groupId={gid}
        detail={safeDetail}
        messages={feed}
        isOwner={isStaff}
        onClose={() => setWallOpen(false)}
        onReact={react}
        onCheckin={() => setComposerMode('checkin')}
      />

      {inviteOpen && safeDetail.join_code ? (
        <GroupInviteSheet
          gid={gid}
          groupName={safeDetail.name}
          joinCode={safeDetail.join_code}
          intro={safeDetail.intro}
          planTitle={safeDetail.plan_title}
          planDayLine={invitePlanDayLine}
          checkedInToday={safeDetail.checked_in_today}
          memberTotal={members.length}
          memberUserIds={members.map((m) => m.user_id).filter(Boolean) as string[]}
          onClose={() => setInviteOpen(false)}
        />
      ) : null}

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
        initialPane={settingsPane}
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
        onOpenPrayer={() => openPrayer()}
      />

      <GroupPrayerSheet
        open={prayerOpen}
        gid={gid}
        isStaff={isStaff}
        myUserId={effectiveId()}
        initialCompose={prayerCompose}
        onClose={() => {
          setPrayerOpen(false);
          setPrayerCompose(false);
        }}
        onChanged={() => void refreshPrayerPending()}
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

      <ImChatSearch
        open={searchOpen}
        scope="group"
        refId={gid}
        onClose={() => setSearchOpen(false)}
        onSelect={(mid) => setFocusOverride(mid)}
      />

      <ForwardPickerSheet
        open={Boolean(forwardItems?.length)}
        items={forwardItems || []}
        onClose={() => setForwardItems(null)}
        onDone={(label) => showToast(`已转发到 ${label}`)}
      />

      <GroupMemberProfileSheet
        member={profileMember}
        onClose={() => setProfileMember(null)}
        onMention={(m) => {
          if (!m.user_id) return;
          const base = displayMemberName(m);
          const label = friendRemarkOrName(m.user_id, base);
          setMentionSeed({ id: m.user_id, label });
        }}
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
