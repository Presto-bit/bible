'use client';

import Link from 'next/link';
import { Suspense, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import PageBackBar from '@/components/PageBackBar';
import { api, contentAssetUrl, effectiveId, ensureAccountReady, type DmMessage } from '@/lib/api';
import ErrorBanner, { errorMessage } from '@/components/ErrorBanner';
import { ReportSheet, type ReportReason } from '@/components/social/ReportSheet';
import { ImMessageBody } from '@/components/social/ImMessageBody';
import { ForwardPickerSheet, type ForwardPayload } from '@/components/social/ForwardPickerSheet';
import {
  CHAT_TIME_GAP_MS,
  canRecallOwnMessage,
  copyMessageText,
  focusMessageById,
  formatChatTimeSep,
  localDayKeyFromIso,
  replySnippet,
} from '@/lib/im_ui';
import { ImAttachPreview } from '@/components/social/ImAttachPreview';
import { ImVoiceRecordHud } from '@/components/social/ImVoiceRecordHud';
import {
  IconClose,
  IconFile,
  IconImage,
  IconKeyboard,
  IconMic,
  IconPlus,
} from '@/components/social/ImComposerIcons';
import { ImImageLightbox, type ImLightboxImage } from '@/components/social/ImImageLightbox';
import { ImFilePreviewSheet } from '@/components/social/ImFilePreviewSheet';
import { ImMediaAttachment, parseVoiceDurationHint } from '@/components/social/ImMediaAttachment';
import { ImMsgActionPopover, type ImPopoverAction } from '@/components/social/ImMsgActionPopover';
import { ImSendFailBadge } from '@/components/social/ImSendFailBadge';
import { autosizeTextarea, type PendingAttach } from '@/lib/im_composer';
import { collectMessageImages, downloadImAsset, shareImAsset } from '@/lib/im_media';
import { detectImMediaKind } from '@/lib/im_av';
import { useImComposerKeyboard, useImComposerHeightSync, scrollImChatToBottom, clearImKeyboardLift } from '@/lib/use_im_composer_keyboard';
import { useHoldToTalk } from '@/lib/use_hold_to_talk';
import {
  formatVoiceDurationLabel,
  useVoiceRecorder,
  voiceRecorderSupported,
} from '@/lib/use_voice_recorder';
import { clearImDraft, getImDraftRecord, setImDraftRecord } from '@/lib/im_drafts';
import { FRIEND_REMARKS_EVENT, dmTitleWithRemark } from '@/lib/friend_remarks';
import {
  dequeueFailedText,
  enqueueFailedText,
  enqueueFailedMediaMeta,
  dequeueFailedMediaMeta,
  listFailedMediaMeta,
  listFailedText,
  loadMediaFile,
  peekFailedMediaMeta,
  peekMediaFile,
  rememberMediaFile,
  takeMediaFile,
} from '@/lib/im_send_queue';
import { ImChatSearch } from '@/components/social/ImChatSearch';
import {
  GROUP_CANNED_PHRASES,
  GROUP_EMOJIS,
  cannedPhraseLabel,
  reactionBarEntries,
} from '@/lib/group_reactions';
import { useFocusMessage } from '@/lib/use_focus_message';
import { useImVirtualList } from '@/lib/use_im_virtual_list';
import { subscribeSocialRealtime } from '@/lib/social_realtime';
import { keepIfSameMessageList, mergeImMessageTail, runReloadGate, type ReloadGate } from '@/lib/im_list_perf';
import { useOnline } from '@/lib/use_online';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';

type LocalDm = DmMessage & {
  pending?: boolean;
  sendFailed?: boolean;
  retryText?: string;
  reactions?: Record<string, string[]>;
};

const QUICK_EMOJIS = [...GROUP_EMOJIS];
const QUICK_PHRASES = GROUP_CANNED_PHRASES.map((p) => ({ key: p.key, label: p.label }));

function formatSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DmThreadPageInner() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const focusMsg = searchParams.get('focusMsg');
  const [focusOverride, setFocusOverride] = useState<string | null>(null);
  const activeFocus = focusOverride || focusMsg;
  const [searchOpen, setSearchOpen] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const hasMoreRef = useRef(false);
  const loadingMoreRef = useRef(false);
  useEdgeSwipeBack({ href: '/discover' });
  const online = useOnline();
  const threadId = id;
  const [uid, setUid] = useState<string | null>(null);
  const [title, setTitle] = useState('私信');
  const [peerTitleRaw, setPeerTitleRaw] = useState('私信');
  const [peerUserId, setPeerUserId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<LocalDm[]>([]);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [replyTo, setReplyTo] = useState<{
    id: string;
    snippet: string;
  } | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const [jumpUnread, setJumpUnread] = useState(0);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardItems, setForwardItems] = useState<ForwardPayload[]>([]);
  const [actionMsgId, setActionMsgId] = useState<string | null>(null);
  const [actionAnchor, setActionAnchor] = useState<HTMLElement | null>(null);
  const [lightbox, setLightbox] = useState<{ images: ImLightboxImage[]; index: number } | null>(
    null,
  );
  const [filePreview, setFilePreview] = useState<{
    url: string;
    fileName?: string | null;
    mime?: string | null;
    storageKey?: string | null;
  } | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const stickBottom = useRef(true);
  const bottomMsgIdRef = useRef<string | null>(null);
  const wasOffline = useRef(false);
  const dmReloadGate = useRef<ReloadGate>({ busy: false, queued: false });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStart = useRef<{ x: number; y: number } | null>(null);
  const longPressFired = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const composerBarRef = useRef<HTMLDivElement | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  useImComposerHeightSync(composerBarRef);
  /** 仅输入聚焦时抬键盘；加号打开时不套用 kb-inset，面板贴屏底 */
  useImComposerKeyboard(composerFocused, {
    getScrollEl: () => listRef.current,
  });

  useEffect(() => {
    document.body.classList.toggle('im-plus-sheet', plusOpen);
    return () => document.body.classList.remove('im-plus-sheet');
  }, [plusOpen]);

  /** 点消息区空白收起加号面板 */
  useEffect(() => {
    if (!plusOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (composerBarRef.current?.contains(t)) return;
      setPlusOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [plusOpen]);

  const [plusAccept, setPlusAccept] = useState(
    'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp4,audio/wav,audio/aac,audio/ogg,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.mp3,.m4a,.mp4,.mov,.webm',
  );
  const [pending, setPending] = useState<PendingAttach | null>(null);
  const msgsRef = useRef(msgs);
  msgsRef.current = msgs;

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    if (!peerUserId) return;
    const sync = () => setTitle(dmTitleWithRemark(peerUserId, peerTitleRaw));
    sync();
    window.addEventListener(FRIEND_REMARKS_EVENT, sync);
    return () => window.removeEventListener(FRIEND_REMARKS_EVENT, sync);
  }, [peerUserId, peerTitleRaw]);

  const sendBodyRef = useRef<
    (body: string, replyId?: string, replaceTempId?: string) => Promise<boolean>
  >(async () => false);

  const byId = useMemo(() => {
    const map = new Map<string, LocalDm>();
    for (const m of msgs) map.set(m.id, m);
    return map;
  }, [msgs]);

  const msgKeys = useMemo(() => msgs.map((m) => m.id), [msgs]);
  const virtPinKeys = useMemo(
    () => [activeFocus, actionMsgId, replyTo?.id, ...(selectMode ? [...selectedIds] : [])],
    [activeFocus, actionMsgId, replyTo?.id, selectMode, selectedIds],
  );
  const virt = useImVirtualList({
    itemKeys: msgKeys,
    scrollRef: listRef,
    pinKeys: virtPinKeys,
  });

  useEffect(() => {
    if (!threadId) return;
    const d = getImDraftRecord('dm', threadId);
    setText(d.text || '');
    if (d.replyToId) {
      setReplyTo({
        id: d.replyToId,
        snippet: d.replySnippet || '',
      });
    }
  }, [threadId]);

  useEffect(() => {
    if (!threadId) return;
    const t = window.setTimeout(() => {
      setImDraftRecord('dm', threadId, {
        text,
        replyToId: replyTo?.id,
        replySnippet: replyTo?.snippet,
      });
    }, 400);
    return () => window.clearTimeout(t);
  }, [text, threadId, replyTo]);

  useEffect(() => {
    autosizeTextarea(inputRef.current, 4);
  }, [text]);

  useEffect(() => {
    if (!replyTo) return;
    setPlusOpen(false);
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [replyTo?.id]);

  useEffect(() => {
    return () => {
      if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl);
    };
  }, [pending]);

  const markedReadRef = useRef(false);

  const reload = useCallback(async () => {
    if (!threadId) return;
    await runReloadGate(dmReloadGate.current, async () => {
      try {
        const r = await api.dmMessages(threadId, { limit: 50 });
        const incoming = (r.messages || []) as LocalDm[];
        if (r.peer_user_id) setPeerUserId(r.peer_user_id);
        if (r.peer_title || r.peer_user_id) {
          const raw = r.peer_title || '私信';
          setPeerTitleRaw(raw);
          setTitle(dmTitleWithRemark(r.peer_user_id, raw));
        }
        startTransition(() => {
          setMsgs((prev) => mergeImMessageTail(prev, incoming));
          // 已翻页时勿被热刷新把 has_more 打回 true 导致哨兵误触
          if (!hasMoreRef.current || msgsRef.current.length <= incoming.length + 2) {
            hasMoreRef.current = Boolean(r.has_more);
            setHasMore(Boolean(r.has_more));
          }
          void api.patchConversationState('dm', threadId, {}).catch(() => {});
          if (!markedReadRef.current) {
            markedReadRef.current = true;
            void import('@/lib/discover_unread').then((m) => m.notifyDiscoverUnreadChanged());
          }
          setErr(null);
        });
      } catch (e) {
        setErr(errorMessage(e, '加载失败'));
      }
    });
  }, [threadId]);

  const loadMore = useCallback(async (): Promise<boolean> => {
    if (loadingMoreRef.current) return hasMoreRef.current;
    const cur = msgsRef.current;
    if (!cur.length || !hasMoreRef.current || !threadId) return false;
    const oldest = cur[0]?.created_at;
    if (!oldest) return false;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const r = await api.dmMessages(threadId, { limit: 50, before: oldest });
      const older = (r.messages || []) as LocalDm[];
      setMsgs((prev) => {
        const next = [...older, ...prev];
        msgsRef.current = next;
        return next;
      });
      hasMoreRef.current = Boolean(r.has_more);
      setHasMore(Boolean(r.has_more));
      return Boolean(r.has_more);
    } catch (e) {
      setErr(errorMessage(e, '加载更多失败'));
      return hasMoreRef.current;
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [threadId]);

  useFocusMessage(activeFocus, { loadOlder: loadMore });

  useEffect(() => {
    void ensureAccountReady().then(() => setUid(effectiveId() || null));
  }, []);

  useEffect(() => {
    markedReadRef.current = false;
  }, [threadId]);

  useEffect(() => {
    if (!uid || !threadId) return;
    void reload();
  }, [uid, threadId, reload]);

  useEffect(() => {
    if (!uid || !threadId) return;
    const queued = listFailedMediaMeta('dm', threadId);
    if (!queued.length) return;
    setMsgs((prev) => {
      const have = new Set(prev.map((m) => m.id));
      const extras: LocalDm[] = [];
      for (const q of queued) {
        if (have.has(q.id)) continue;
        extras.push({
          id: q.id,
          sender_id: uid,
          kind: q.kind || detectImMediaKind(q.mime, q.file_name) || 'file',
          body: q.body,
          reply_to_id: q.replyToId || null,
          created_at: new Date().toISOString(),
          pending: false,
          sendFailed: true,
          mine: true,
          retryMedia: {
            storage_key: q.storage_key,
            file_name: q.file_name,
            mime: q.mime,
            size_bytes: q.size_bytes,
            url: q.url,
            body: q.body,
            reply_to_id: q.replyToId,
          },
        });
      }
      return extras.length ? [...prev, ...extras] : prev;
    });
  }, [uid, threadId]);

  useEffect(() => {
    if (!uid || !threadId) return;
    return subscribeSocialRealtime(
      (_c, changed) => {
        if (changed) void reload();
      },
      { watch: 'dm', debounceMs: 400 },
    );
  }, [uid, threadId, reload]);

  useEffect(() => {
    if (!threadId) return;
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      markedReadRef.current = false;
      markedReadRef.current = false;
      void api.patchConversationState('dm', threadId, {}).then(() => {
        markedReadRef.current = true;
        void import('@/lib/discover_unread').then((m) => m.notifyDiscoverUnreadChanged());
      }).catch(() => {});
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [threadId]);

  const initialPinned = useRef(false);

  useEffect(() => {
    initialPinned.current = false;
  }, [threadId]);

  useEffect(() => {
    if (!msgs.length || activeFocus) return;
    const el = listRef.current;
    const pin = (smooth: boolean) => {
      if (el) {
        if (smooth) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        else el.scrollTop = el.scrollHeight;
        return;
      }
      endRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
    };
    if (!initialPinned.current) {
      initialPinned.current = true;
      stickBottom.current = true;
      pin(false);
      requestAnimationFrame(() => pin(false));
      return;
    }
    if (!stickBottom.current) return;
    pin(false);
  }, [msgs.length, activeFocus]);

  useEffect(() => {
    if (!hasMore) return;
    const el = loadMoreRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMoreRef.current) void loadMore();
      },
      { root: listRef.current, rootMargin: '120px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadMore]);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (!wasOffline.current || !threadId) return;
    wasOffline.current = false;
    const queued = listFailedText('dm', threadId);
    if (!queued.length) return;
    for (const q of queued) {
      const m = msgsRef.current.find((x) => x.id === q.id && x.sendFailed && x.retryText);
      if (m) void sendBodyRef.current(m.retryText!, m.reply_to_id || undefined, m.id);
    }
  }, [online, threadId]);

  const onListScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickBottom.current = dist < 80;
    if (stickBottom.current) setJumpUnread(0);
    const nextJump = dist > 120;
    setShowJump((prev) => (prev === nextJump ? prev : nextJump));
  };

  const jumpBottom = () => {
    stickBottom.current = true;
    setShowJump(false);
    setJumpUnread(0);
    scrollImChatToBottom(listRef.current);
  };

  const sendBody = useCallback(
    async (body: string, replyId?: string, replaceTempId?: string): Promise<boolean> => {
      if (!online || !threadId || !uid) return false;
      setSending(true);
      const tempId = replaceTempId || `temp-${Date.now()}`;
      if (!replaceTempId) {
        setMsgs((prev) => [
          ...prev,
          {
            id: tempId,
            sender_id: uid,
            kind: 'chat',
            body,
            reply_to_id: replyId || null,
            created_at: new Date().toISOString(),
            pending: true,
            retryText: body,
          },
        ]);
      } else {
        setMsgs((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? { ...m, pending: true, sendFailed: false, retryText: body }
              : m,
          ),
        );
      }
      try {
        await api.sendDm(threadId, { body, kind: 'chat', reply_to_id: replyId });
        dequeueFailedText(tempId);
        await reload();
        return true;
      } catch (e) {
        enqueueFailedText({
          id: tempId,
          scope: 'dm',
          refId: threadId,
          body,
          replyToId: replyId,
        });
        setMsgs((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? { ...m, pending: false, sendFailed: true, retryText: body }
              : m,
          ),
        );
        setErr(errorMessage(e, '发送失败'));
        return false;
      } finally {
        setSending(false);
      }
    },
    [online, threadId, uid, reload],
  );

  sendBodyRef.current = sendBody;

  const send = async () => {
    if (!online) {
      setErr('当前离线，联网后再发送');
      return;
    }
    const body = text.trim();
    if (!body || sending || uploading) return;
    const replyId = replyTo?.id;
    const ok = await sendBody(body, replyId);
    if (ok) {
      setText('');
      clearImDraft('dm', threadId);
      setReplyTo(null);
      requestAnimationFrame(() => autosizeTextarea(inputRef.current, 4));
    }
  };

  // Real voice (preferred) with STT fallback
  const sendVoiceFile = async (file: File, durationSec: number) => {
    if (!online || !threadId || !uid || sending || uploading) return;
    const tempId = `temp-${Date.now()}`;
    const caption = formatVoiceDurationLabel(durationSec);
    const replyId = replyTo?.id;
    setMsgs((prev) => [
      ...prev,
      {
        id: tempId,
        sender_id: uid,
        kind: 'audio',
        body: caption,
        reply_to_id: replyId || null,
        created_at: new Date().toISOString(),
        pending: true,
        mine: true,
      },
    ]);
    rememberMediaFile(tempId, file);
    setUploading(true);
    setUploadPct(0);
    let uploaded: Awaited<ReturnType<typeof api.uploadSocialMedia>> | null = null;
    try {
      uploaded = await api.uploadSocialMedia(file, {
        onProgress: (pct) => setUploadPct(pct),
      });
      await api.sendDmMedia(threadId, {
        storage_key: uploaded.storage_key,
        file_name: uploaded.file_name,
        mime: uploaded.mime_type,
        size_bytes: uploaded.size_bytes,
        url: uploaded.url,
        body: caption,
        reply_to_id: replyId,
      });
      takeMediaFile(tempId);
      dequeueFailedMediaMeta(tempId);
      clearImDraft('dm', threadId);
      setReplyTo(null);
      await reload();
    } catch (e) {
      rememberMediaFile(tempId, file);
      if (uploaded) {
        const retryMedia = {
          storage_key: uploaded.storage_key,
          file_name: uploaded.file_name,
          mime: uploaded.mime_type,
          size_bytes: uploaded.size_bytes,
          url: uploaded.url,
          body: caption,
          reply_to_id: replyId,
        };
        enqueueFailedMediaMeta({
          id: tempId,
          scope: 'dm',
          refId: threadId,
          kind: 'audio',
          storage_key: uploaded.storage_key,
          file_name: uploaded.file_name,
          mime: uploaded.mime_type,
          size_bytes: uploaded.size_bytes,
          url: uploaded.url,
          body: caption,
          replyToId: replyId,
        });
        setMsgs((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? { ...m, pending: false, sendFailed: true, retryMedia }
              : m,
          ),
        );
      } else {
        setMsgs((prev) =>
          prev.map((m) =>
            m.id === tempId ? { ...m, pending: false, sendFailed: true } : m,
          ),
        );
      }
      setErr(errorMessage(e, '语音发送失败'));
    } finally {
      setUploading(false);
      setUploadPct(0);
    }
  };

  const recorder = useVoiceRecorder({
    onRecorded: (file, sec) => {
      void sendVoiceFile(file, sec);
    },
    onUnsupported: () => {
      setErr('当前浏览器不支持录音，请用键盘');
      setVoiceMode(false);
    },
    onError: (msg) => setErr(msg),
  });
  const stt = useHoldToTalk({
    onResult: (spoken) => {
      void (async () => {
        if (!online) {
          setErr('当前离线，联网后再发送');
          return;
        }
        const body = spoken.trim();
        if (!body || sending || uploading) return;
        const ok = await sendBody(body, replyTo?.id);
        if (ok) {
          clearImDraft('dm', threadId);
          setReplyTo(null);
        }
      })();
    },
    onUnsupported: () => {
      setErr('当前浏览器不支持语音输入，请用键盘');
      setVoiceMode(false);
    },
  });
  const useRecorder = voiceRecorderSupported();
  const recording = useRecorder ? recorder.recording : stt.recording;
  const cancelArmed = useRecorder ? recorder.cancelArmed : stt.cancelArmed;
  const startVoice = useRecorder ? recorder.startVoice : stt.startVoice;
  const onVoiceMove = useRecorder ? recorder.onVoiceMove : stt.onVoiceMove;
  const endVoice = useRecorder ? recorder.endVoice : stt.endVoice;
  const voiceHoldLabel = recording
    ? cancelArmed
      ? '松开取消'
      : useRecorder
        ? `松开发送 ${recorder.elapsedSec || 1}″ · 上滑取消`
        : '松开发送 · 上滑取消'
    : useRecorder
      ? '按住 说话'
      : '按住 说话（转文字）';

  useEffect(() => {
    const last = msgs[msgs.length - 1];
    if (!last) return;
    const prevId = bottomMsgIdRef.current;
    bottomMsgIdRef.current = last.id;
    if (!prevId || prevId === last.id) return;
    if (stickBottom.current) {
      setJumpUnread(0);
      return;
    }
    if (last.sender_id !== uid && !last.id.startsWith('temp-')) {
      setJumpUnread((n) => n + 1);
      setShowJump(true);
    }
  }, [msgs, uid]);

  const resend = async (m: LocalDm) => {
    if (m.sendFailed && m.retryText) {
      await sendBody(m.retryText, m.reply_to_id || undefined, m.id);
      return;
    }
    const meta = m.retryMedia || peekFailedMediaMeta(m.id);
    if (meta && threadId) {
      const replyToId =
        ('reply_to_id' in meta ? meta.reply_to_id : undefined)
        || ('replyToId' in meta ? meta.replyToId : undefined)
        || m.reply_to_id
        || undefined;
      setUploading(true);
      setMsgs((prev) =>
        prev.map((x) => (x.id === m.id ? { ...x, pending: true, sendFailed: false } : x)),
      );
      try {
        await api.sendDmMedia(threadId, {
          storage_key: meta.storage_key,
          file_name: meta.file_name,
          mime: meta.mime,
          size_bytes: meta.size_bytes,
          url: meta.url,
          body: meta.body,
          reply_to_id: replyToId,
        });
        dequeueFailedMediaMeta(m.id);
        takeMediaFile(m.id);
        await reload();
      } catch (e) {
        setMsgs((prev) =>
          prev.map((x) => (x.id === m.id ? { ...x, pending: false, sendFailed: true } : x)),
        );
        setErr(errorMessage(e, '重发失败'));
      } finally {
        setUploading(false);
      }
      return;
    }
    const file = peekMediaFile(m.id) || (await loadMediaFile(m.id));
    if (file) {
      await resendMedia(m.id, file, m.body || undefined, m.reply_to_id || undefined);
    }
  };

  const resendMedia = async (
    tempId: string,
    file: File,
    caption?: string,
    replyId?: string,
  ) => {
    if (!threadId || uploading) return;
    setUploading(true);
    setUploadPct(0);
    setMsgs((prev) =>
      prev.map((m) =>
        m.id === tempId ? { ...m, pending: true, sendFailed: false } : m,
      ),
    );
    let uploaded: Awaited<ReturnType<typeof api.uploadSocialMedia>> | null = null;
    try {
      uploaded = await api.uploadSocialMedia(file, {
        onProgress: (pct) => setUploadPct(pct),
      });
      await api.sendDmMedia(threadId, {
        storage_key: uploaded.storage_key,
        file_name: uploaded.file_name,
        mime: uploaded.mime_type,
        size_bytes: uploaded.size_bytes,
        url: uploaded.url,
        body: caption,
        reply_to_id: replyId,
      });
      takeMediaFile(tempId);
      dequeueFailedMediaMeta(tempId);
      await reload();
    } catch (e) {
      rememberMediaFile(tempId, file);
      if (uploaded) {
        const retryMedia = {
          storage_key: uploaded.storage_key,
          file_name: uploaded.file_name,
          mime: uploaded.mime_type,
          size_bytes: uploaded.size_bytes,
          url: uploaded.url,
          body: caption,
          reply_to_id: replyId,
        };
        enqueueFailedMediaMeta({
          id: tempId,
          scope: 'dm',
          refId: threadId,
          storage_key: uploaded.storage_key,
          file_name: uploaded.file_name,
          mime: uploaded.mime_type,
          size_bytes: uploaded.size_bytes,
          url: uploaded.url,
          body: caption,
          replyToId: replyId,
        });
        setMsgs((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? { ...m, pending: false, sendFailed: true, retryMedia }
              : m,
          ),
        );
      } else {
        setMsgs((prev) =>
          prev.map((m) =>
            m.id === tempId ? { ...m, pending: false, sendFailed: true } : m,
          ),
        );
      }
      setErr(errorMessage(e, '发送失败'));
    } finally {
      setUploading(false);
      setUploadPct(0);
    }
  };

  const clearPending = () => {
    setPending((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  };

  const queueFiles = (files: FileList | null) => {
    if (!files?.length || !threadId || uploading || !uid || !online) return;
    const file = files[0];
    if (!file) return;
    setPlusOpen(false);
    const previewUrl =
      file.type.startsWith('image/') || file.type.startsWith('video/')
        ? URL.createObjectURL(file)
        : null;
    setPending((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return { file, previewUrl };
    });
  };

  const confirmPending = async () => {
    if (!pending || !threadId || uploading || !uid || !online) return;
    setUploading(true);
    setUploadPct(0);
    const file = pending.file;
    const tempId = `temp-${Date.now()}`;
    const caption = text.trim() || undefined;
    const replyId = replyTo?.id;
    const mediaKind = detectImMediaKind(file.type, file.name);
    setMsgs((prev) => [
      ...prev,
      {
        id: tempId,
        sender_id: uid,
        kind: mediaKind,
        body: caption,
        reply_to_id: replyId || null,
        created_at: new Date().toISOString(),
        pending: true,
      },
    ]);
    let uploaded: Awaited<ReturnType<typeof api.uploadSocialMedia>> | null = null;
    try {
      uploaded = await api.uploadSocialMedia(file, {
        onProgress: (pct) => setUploadPct(pct),
      });
      await api.sendDmMedia(threadId, {
        storage_key: uploaded.storage_key,
        file_name: uploaded.file_name,
        mime: uploaded.mime_type,
        size_bytes: uploaded.size_bytes,
        url: uploaded.url,
        body: caption,
        reply_to_id: replyId,
      });
      takeMediaFile(tempId);
      dequeueFailedMediaMeta(tempId);
      setText('');
      clearImDraft('dm', threadId);
      setReplyTo(null);
      clearPending();
      await reload();
    } catch (e) {
      rememberMediaFile(tempId, file);
      if (uploaded) {
        const retryMedia = {
          storage_key: uploaded.storage_key,
          file_name: uploaded.file_name,
          mime: uploaded.mime_type,
          size_bytes: uploaded.size_bytes,
          url: uploaded.url,
          body: caption,
          reply_to_id: replyId,
        };
        enqueueFailedMediaMeta({
          id: tempId,
          scope: 'dm',
          refId: threadId,
          kind: mediaKind,
          storage_key: uploaded.storage_key,
          file_name: uploaded.file_name,
          mime: uploaded.mime_type,
          size_bytes: uploaded.size_bytes,
          url: uploaded.url,
          body: caption,
          replyToId: replyId,
        });
        setMsgs((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? { ...m, pending: false, sendFailed: true, retryMedia }
              : m,
          ),
        );
      } else {
        setMsgs((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, pending: false, sendFailed: true } : m)),
        );
      }
      setErr(errorMessage(e, '发送失败'));
    } finally {
      setUploading(false);
      setUploadPct(0);
    }
  };

  const sendFile = async (files: FileList | null) => {
    queueFiles(files);
  };

  const recall = async (mid: string) => {
    try {
      await api.recallMessage(mid);
      await reload();
    } catch (e) {
      setErr(errorMessage(e, '撤回失败'));
    }
  };

  const react = async (mid: string, emoji: string) => {
    if (!uid) return;
    try {
      await api.reactMessage(mid, emoji);
      setMsgs((prev) =>
        prev.map((m) => {
          if (m.id !== mid) return m;
          const reactions = { ...(m.reactions || {}) };
          const users = [...(reactions[emoji] || [])];
          const i = users.indexOf(uid);
          if (i >= 0) {
            users.splice(i, 1);
            if (users.length) reactions[emoji] = users;
            else delete reactions[emoji];
          } else {
            reactions[emoji] = [...users, uid];
          }
          return { ...m, reactions };
        }),
      );
    } catch (e) {
      setErr(errorMessage(e, '反应发送失败'));
    }
  };

  const submitReport = async (reason: ReportReason, detail?: string) => {
    if (!reportId) return;
    setReportBusy(true);
    try {
      await api.reportContent('dm', reportId, reason, detail);
      setReportId(null);
    } catch (e) {
      setErr(errorMessage(e, '举报失败'));
    } finally {
      setReportBusy(false);
    }
  };

  const toggleSelect = (mid: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(mid)) next.delete(mid);
      else next.add(mid);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const openForward = (items: ForwardPayload[]) => {
    setForwardItems(items);
    setForwardOpen(true);
  };

  const forwardSelected = () => {
    const items: ForwardPayload[] = [];
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
    if (items.length) openForward(items);
  };

  const deleteSelected = async () => {
    if (!selectedIds.size) return;
    if (!window.confirm(`删除已选 ${selectedIds.size} 条消息？仅可删除自己发送的消息。`)) return;
    const ids = [...selectedIds];
    exitSelectMode();
    for (const id of ids) {
      const m = msgsRef.current.find((x) => x.id === id);
      if (!m) continue;
      if (id.startsWith('temp-') || m.sendFailed) {
        dequeueFailedText(id);
        dequeueFailedMediaMeta(id);
        takeMediaFile(id);
        setMsgs((prev) => prev.filter((x) => x.id !== id));
        continue;
      }
      if (m.sender_id !== uid) continue;
      try {
        await api.deleteMessage(id);
        setMsgs((prev) => prev.filter((x) => x.id !== id));
      } catch (e) {
        setErr(errorMessage(e, '删除失败'));
      }
    }
  };

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressStart.current = null;
  };

  const openMsgActions = (mid: string, el?: HTMLElement | null) => {
    if (selectMode) return;
    const m = byId.get(mid);
    if (!m || m.recalled || m.pending) return;
    longPressFired.current = true;
    try {
      navigator.vibrate?.(12);
    } catch {
      /* ignore */
    }
    setActionAnchor(el ?? null);
    setActionMsgId(mid);
  };

  const closeMsgActions = () => {
    setActionMsgId(null);
    setActionAnchor(null);
  };

  const startLongPress = (mid: string, el: HTMLElement, x: number, y: number) => {
    longPressFired.current = false;
    clearLongPress();
    longPressStart.current = { x, y };
    longPressTimer.current = setTimeout(() => openMsgActions(mid, el), 450);
  };

  const openImages = (images: ImLightboxImage[], index: number) => {
    if (!images.length) return;
    setLightbox({ images, index });
  };

  const actionMsg = actionMsgId ? byId.get(actionMsgId) : undefined;
  const actionMine = actionMsg
    ? (actionMsg.mine ?? actionMsg.sender_id === uid)
    : false;
  const actionImages = actionMsg
    ? collectMessageImages(actionMsg.attachments, actionMsg.kind)
    : [];

  const actionItems: ImPopoverAction[] = (() => {
    if (!actionMsg || actionMsg.recalled) return [];
    const items: ImPopoverAction[] = [];
    if (actionMsg.sendFailed) {
      items.push({
        id: 'resend',
        label: '重发',
        icon: '↻',
        onClick: () => void resend(actionMsg),
      });
      items.push({
        id: 'discard',
        label: '删除',
        icon: '⌫',
        danger: true,
        onClick: () => {
          dequeueFailedText(actionMsg.id);
          dequeueFailedMediaMeta(actionMsg.id);
          takeMediaFile(actionMsg.id);
          setMsgs((prev) => prev.filter((x) => x.id !== actionMsg.id));
        },
      });
      return items;
    }
    if (!actionMsg.pending) {
      items.push({
        id: 'reply',
        label: '回复',
        icon: '↩',
        onClick: () => {
          setReplyTo({
            id: actionMsg.id,
            snippet: replySnippet(
              actionMsg.body,
              actionMsg.kind,
              actionMsg.attachments?.[0]?.file_name,
              actionMsg.ref,
            ),
          });
        },
      });
      if (actionMsg.body || actionMsg.ref) {
        items.push({
          id: 'copy',
          label: '复制',
          icon: '⧉',
          onClick: () => {
            void copyMessageText([actionMsg.ref, actionMsg.body]);
          },
        });
      }
      if (actionImages.length) {
        items.push({
          id: 'save',
          label: '保存',
          icon: '↓',
          onClick: () => {
            void downloadImAsset(actionImages[0]!.src, actionImages[0]!.alt);
          },
        });
      }
      items.push({
        id: 'forward',
        label: '转发',
        icon: '↗',
        onClick: () => {
          openForward([
            {
              body: actionMsg.body,
              kind: actionMsg.kind,
              ref: actionMsg.ref,
              attachments: actionMsg.attachments?.map((a) => ({
                url: a.url,
                file_name: a.file_name,
                mime: a.mime,
              })),
            },
          ]);
        },
      });
      if (!actionMsg.id.startsWith('temp-')) {
        items.push({
          id: 'multi',
          label: '多选',
          icon: '☑',
          onClick: () => {
            setSelectMode(true);
            setSelectedIds(new Set([actionMsg.id]));
          },
        });
      }
      if (
        canRecallOwnMessage(actionMsg.created_at, {
          mine: actionMine,
          recalled: actionMsg.recalled,
        })
      ) {
        items.push({
          id: 'recall',
          label: '撤回',
          icon: '↺',
          danger: true,
          onClick: () => void recall(actionMsg.id),
        });
      }
      if (actionMine && !actionMsg.id.startsWith('temp-')) {
        items.push({
          id: 'delete',
          label: '删除',
          icon: '⌫',
          danger: true,
          onClick: () => {
            void (async () => {
              try {
                await api.deleteMessage(actionMsg.id);
                setMsgs((prev) => prev.filter((x) => x.id !== actionMsg.id));
              } catch (e) {
                setErr(errorMessage(e, '删除失败'));
              }
            })();
          },
        });
      }
      if (!actionMine) {
        items.push({
          id: 'report',
          label: '举报',
          icon: '⚑',
          danger: true,
          onClick: () => setReportId(actionMsg.id),
        });
      }
    }
    return items;
  })();

  return (
    <main className="dm-page">
      <header className="dm-page-head">
        <PageBackBar href="/discover" label="消息" />
        <h1 className="dm-page-title">{title}</h1>
        {!selectMode ? (
          <div className="dm-page-actions">
            <button
              type="button"
              className="icon-btn dm-page-search"
              aria-label="搜索聊天记录"
              onClick={() => setSearchOpen(true)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
                <path d="M16.2 16.2L20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
            {peerUserId ? (
              <Link href={`/discover/friends/${peerUserId}`} className="dm-page-profile text-link">
                资料
              </Link>
            ) : (
              <span className="dm-page-profile-slot" aria-hidden />
            )}
          </div>
        ) : (
          <span className="dm-page-profile-slot" aria-hidden />
        )}
      </header>

      {selectMode ? (
        <div className="im-select-toolbar">
          <button type="button" className="text-link" onClick={exitSelectMode}>
            取消
          </button>
          <span className="muted">已选 {selectedIds.size} 条</span>
          <span className="im-select-toolbar-spacer" aria-hidden />
        </div>
      ) : null}

      {err ? <ErrorBanner message={err} onRetry={() => void reload()} /> : null}
      {!online ? (
        <p className="muted offline-page-hint">当前离线，私信需联网后收发。</p>
      ) : null}
      <div className="dm-page-body">
        <div
          ref={listRef}
          className="dm-msg-list"
          onScroll={onListScroll}
        >
          <div ref={loadMoreRef} className="group-feed-load-sentinel" aria-hidden>
            {loadingMore ? <span className="muted">加载更早消息…</span> : null}
            {!hasMore && msgs.length > 12 ? <span className="muted">没有更早消息了</span> : null}
          </div>
          {msgs.length === 0 ? (
            <div className="dm-empty">
              <strong>打个招呼吧</strong>
              <p className="muted">发一句问候，开始这段对话。</p>
            </div>
          ) : null}
          {virt.paddingTop > 0 ? (
            <div style={{ height: virt.paddingTop }} aria-hidden />
          ) : null}
          {msgs.slice(virt.start, virt.end).map((m, sliceIdx) => {
            const idx = virt.start + sliceIdx;
            const mine = m.mine ?? m.sender_id === uid;
            const parent = m.reply_to_id ? byId.get(m.reply_to_id) : undefined;
            const prev = idx > 0 ? msgs[idx - 1]! : null;
            const prevTs = prev?.created_at ? new Date(prev.created_at).getTime() : 0;
            const curTs = m.created_at ? new Date(m.created_at).getTime() : 0;
            const dayKey = localDayKeyFromIso(m.created_at);
            const prevDay = prev ? localDayKeyFromIso(prev.created_at) : '';
            const showDay = Boolean(dayKey && dayKey !== prevDay);
            const showTimeSep =
              !showDay
              && Boolean(prev)
              && curTs - prevTs >= CHAT_TIME_GAP_MS;
            const sameSender =
              Boolean(prev)
              && !showDay
              && !showTimeSep
              && (prev!.mine ?? prev!.sender_id === uid) === mine
              && prev!.sender_id === m.sender_id;
            const selected = selectedIds.has(m.id);
            const canSelect = selectMode && !m.recalled && !m.pending && !m.id.startsWith('temp-');

            return (
              <div
                key={m.id}
                className="dm-msg-block"
                ref={(node) => virt.measureRef(m.id, node)}
              >
                {showDay || showTimeSep ? (
                  <div className={`dm-day-sep${showTimeSep && !showDay ? ' is-time' : ''}`} role="separator">
                    <span>{formatChatTimeSep(m.created_at)}</span>
                  </div>
                ) : null}
                <div
                  data-mid={m.id}
                  className={`dm-msg-row${mine ? ' is-mine' : ' is-peer'}${m.pending ? ' is-pending' : ''}${m.sendFailed ? ' is-failed' : ''}${sameSender ? ' is-continue' : ''}`}
                  onClick={() => {
                    if (longPressFired.current) {
                      longPressFired.current = false;
                      return;
                    }
                    if (canSelect) toggleSelect(m.id);
                  }}
                >
                {selectMode ? (
                  <button
                    type="button"
                    className={`im-msg-check${selected ? ' is-on' : ''}`}
                    aria-label={selected ? '取消选择' : '选择'}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (canSelect || selected) toggleSelect(m.id);
                    }}
                  />
                ) : null}
                {m.sendFailed && mine ? (
                  <ImSendFailBadge
                    label={
                      m.retryText || peekMediaFile(m.id)
                        ? '发送失败，点击重发'
                        : '发送失败'
                    }
                    onClick={
                      m.retryText || peekMediaFile(m.id)
                        ? () => {
                            void resend(m);
                          }
                        : undefined
                    }
                  />
                ) : null}
                <div className="dm-bubble-wrap">
                <div
                  role="button"
                  tabIndex={0}
                  className="dm-bubble"
                  onPointerDown={(e) => {
                    if (e.pointerType === 'mouse' && e.button !== 0) return;
                    startLongPress(m.id, e.currentTarget, e.clientX, e.clientY);
                  }}
                  onPointerMove={(e) => {
                    const s = longPressStart.current;
                    if (!s || !longPressTimer.current) return;
                    if (Math.abs(e.clientX - s.x) > 12 || Math.abs(e.clientY - s.y) > 12) {
                      clearLongPress();
                    }
                  }}
                  onPointerUp={clearLongPress}
                  onPointerCancel={clearLongPress}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openMsgActions(m.id, e.currentTarget);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openMsgActions(m.id, e.currentTarget);
                    }
                  }}
                >
                  {m.recalled ? (
                    <span className="muted">消息已撤回</span>
                  ) : (
                    <>
                      {m.reply_to_id ? (
                        <button
                          type="button"
                          className="group-msg-reply-quote is-tappable"
                          disabled={!parent}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (parent) focusMessageById(parent.id);
                          }}
                        >
                          <span className="muted">
                            {parent ? '回复' : '原消息'}
                          </span>
                          <p>
                            {parent
                              ? parent.recalled
                                ? '消息已撤回'
                                : replySnippet(
                                    parent.body,
                                    parent.kind,
                                    parent.attachments?.[0]?.file_name,
                                  )
                              : '（暂未加载）'}
                          </p>
                        </button>
                      ) : null}
                      <ImMessageBody body={m.body} ref={m.ref} kind={m.kind} />
                      {m.attachments && m.attachments.length > 0 ? (
                        <div className="group-msg-attach">
                          {(() => {
                            const msgImages = collectMessageImages(m.attachments, m.kind);
                            return m.attachments.map((a) => {
                            const href = a.url ? contentAssetUrl(a.url) : null;
                            const mediaKind = detectImMediaKind(a.mime, a.file_name, m.kind);
                            const isImg = mediaKind === 'image';
                            if (isImg && href) {
                              const idx = msgImages.findIndex((img) => img.src === href);
                              return (
                                <button
                                  key={a.id}
                                  type="button"
                                  className="im-attach-image-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (longPressFired.current) {
                                      longPressFired.current = false;
                                      return;
                                    }
                                    openImages(msgImages, idx >= 0 ? idx : 0);
                                  }}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={href}
                                    alt={a.file_name || '图片'}
                                    loading="lazy"
                                    decoding="async"
                                  />
                                </button>
                              );
                            }
                            if (href && (mediaKind === 'video' || mediaKind === 'audio')) {
                              return (
                                <div key={a.id} onClick={(e) => e.stopPropagation()}>
                                  <ImMediaAttachment
                                    url={href}
                                    fileName={a.file_name}
                                    mime={a.mime}
                                    messageKind={m.kind}
                                    sizeBytes={a.size_bytes}
                                    durationHintSec={parseVoiceDurationHint(m.body)}
                                  />
                                </div>
                              );
                            }
                            return href ? (
                              <button
                                key={a.id}
                                type="button"
                                className="im-attach-file-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFilePreview({
                                    url: href,
                                    fileName: a.file_name,
                                    mime: a.mime,
                                    storageKey: a.storage_key,
                                  });
                                }}
                              >
                                {a.file_name || '附件'}
                                {a.size_bytes ? (
                                  <span className="im-attach-dl">{formatSize(a.size_bytes)}</span>
                                ) : null}
                              </button>
                            ) : (
                              <span key={a.id}>
                                {a.file_name || '附件'}
                                {a.size_bytes ? (
                                  <span className="im-attach-dl">{formatSize(a.size_bytes)}</span>
                                ) : null}
                              </span>
                            );
                          });
                          })()}
                        </div>
                      ) : null}
                      {m.pending ? (
                        <div className="dm-bubble-foot">
                          <span className="dm-bubble-time muted">发送中…</span>
                        </div>
                      ) : null}
                      {m.sendFailed ? (
                        <div className="dm-bubble-foot">
                          <button
                            type="button"
                            className="text-link danger"
                            style={{ fontSize: 12 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              dequeueFailedText(m.id);
                              dequeueFailedMediaMeta(m.id);
                              takeMediaFile(m.id);
                              setMsgs((prev) => prev.filter((x) => x.id !== m.id));
                            }}
                          >
                            删除
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
                {(() => {
                  const entries = reactionBarEntries(m.reactions);
                  if (m.recalled || m.pending || m.sendFailed || !entries.length) return null;
                  return (
                  <div className="group-emoji-bar group-emoji-bar-summary">
                    {entries.map(({ key, count }) => (
                      <button
                        key={key}
                        type="button"
                        className="group-emoji-btn active"
                        aria-label={key.startsWith('phrase:') ? cannedPhraseLabel(key) : `回应 ${key}`}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          void react(m.id, key);
                        }}
                      >
                        {key.startsWith('phrase:') ? cannedPhraseLabel(key) : key}
                        {` ${count}`}
                      </button>
                    ))}
                  </div>
                  );
                })()}
                </div>
                </div>
              </div>
            );
          })}
          {virt.paddingBottom > 0 ? (
            <div style={{ height: virt.paddingBottom }} aria-hidden />
          ) : null}
          <div ref={endRef} />
        </div>
        {showJump ? (
          <button
            type="button"
            className={`im-jump-bottom${selectMode ? ' is-selecting' : ''}${jumpUnread > 0 ? ' has-unread' : ''}`}
            onClick={jumpBottom}
          >
            回到底部
            {jumpUnread > 0 ? (
              <span className="im-jump-badge">{jumpUnread > 99 ? '99+' : jumpUnread}</span>
            ) : null}
          </button>
        ) : null}
      </div>

      <div
        ref={composerBarRef}
        className={`im-composer-bar dm-composer-dock im-composer-dock${plusOpen ? ' is-plus-open' : ''}${selectMode ? ' is-select-dock' : ''}`}
      >
        {selectMode ? (
          <div className="im-select-dock">
            <button
              type="button"
              className="btn"
              disabled={selectedIds.size === 0}
              onClick={forwardSelected}
            >
              转发{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
            </button>
            <button
              type="button"
              className="btn im-select-dock-danger"
              disabled={selectedIds.size === 0}
              onClick={() => void deleteSelected()}
            >
              删除{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
            </button>
          </div>
        ) : (
          <>
        {replyTo ? (
          <div className="group-composer-reply" style={{ width: '100%' }}>
            <div>
              <span className="muted">回复</span>
              <p>{replyTo.snippet}</p>
            </div>
            <button type="button" className="text-link" onClick={() => setReplyTo(null)}>
              取消
            </button>
          </div>
        ) : null}
        {pending ? (
          <ImAttachPreview
            pending={pending}
            busy={uploading}
            progress={uploadPct}
            caption={text}
            onCaptionChange={setText}
            onCancel={clearPending}
            onConfirm={() => void confirmPending()}
          />
        ) : null}
        <div className="im-composer-row">
          <div className={`im-composer-field-wrap${!online ? ' is-offline' : ''}`}>
            {voiceMode ? (
              <button
                type="button"
                className={`im-voice-hold${recording ? (cancelArmed ? ' is-cancel' : ' is-active') : ''}`}
                disabled={!online || sending || uploading}
                onPointerDown={startVoice}
                onPointerMove={onVoiceMove}
                onPointerUp={endVoice}
                onPointerCancel={endVoice}
              >
                {voiceHoldLabel}
              </button>
            ) : (
              <textarea
                ref={inputRef}
                className="im-composer-field input im-composer-textarea"
                value={text}
                rows={1}
                enterKeyHint="send"
                autoComplete="off"
                autoCorrect="off"
                placeholder={online ? (replyTo ? '回复…' : '发消息…') : '离线不可发，联网后继续'}
                disabled={!online || sending || uploading}
                onChange={(e) => setText(e.target.value)}
                onFocus={() => {
                  setPlusOpen(false);
                  setComposerFocused(true);
                  scrollImChatToBottom(listRef.current, { gentle: true });
                }}
                onBlur={() => {
                  window.setTimeout(() => {
                    if (document.activeElement !== inputRef.current) {
                      setComposerFocused(false);
                    }
                  }, 180);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
            )}
          </div>
          <button
            type="button"
            className="im-composer-voice-toggle"
            disabled={!online || sending || uploading}
            aria-label={voiceMode ? '切换键盘' : '切换语音'}
            onClick={() => {
              setVoiceMode((v) => {
                const next = !v;
                if (next) {
                  inputRef.current?.blur();
                  setComposerFocused(false);
                  setPlusOpen(false);
                }
                return next;
              });
            }}
          >
            {voiceMode ? <IconKeyboard /> : <IconMic />}
          </button>
          {text.trim() && !pending && !voiceMode ? (
            <button
              type="button"
              className="im-composer-send"
              disabled={sending || uploading || !text.trim() || !online}
              onClick={() => void send()}
            >
              {sending ? '…' : '发送'}
            </button>
          ) : null}
          <button
            type="button"
            className={`im-composer-plus${plusOpen ? ' is-open' : ''}`}
            disabled={uploading || sending || !online}
            aria-expanded={plusOpen}
            aria-label={plusOpen ? '收起更多' : '更多'}
            onClick={() => {
              setPlusOpen((v) => {
                const next = !v;
                if (next) {
                  inputRef.current?.blur();
                  setVoiceMode(false);
                  setComposerFocused(false);
                  document.body.classList.add('im-plus-sheet');
                  clearImKeyboardLift();
                }
                return next;
              });
            }}
          >
            {plusOpen ? <IconClose /> : <IconPlus />}
          </button>
        </div>
        {plusOpen ? (
          <div className="im-plus-panel" role="menu">
            <button
              type="button"
              className="im-plus-item"
              disabled={uploading || sending || !online}
              onClick={() => {
                setPlusAccept('image/jpeg,image/png,image/webp,image/gif');
                setPlusOpen(false);
                requestAnimationFrame(() => fileInputRef.current?.click());
              }}
            >
              <span className="im-plus-icon" aria-hidden>
                <IconImage />
              </span>
              <span>图片</span>
            </button>
            <button
              type="button"
              className="im-plus-item"
              disabled={uploading || sending || !online}
              onClick={() => {
                setPlusAccept(
                  'video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp4,audio/wav,audio/aac,audio/ogg,.mp4,.mov,.webm,.mp3,.m4a,.wav',
                );
                setPlusOpen(false);
                requestAnimationFrame(() => fileInputRef.current?.click());
              }}
            >
              <span className="im-plus-icon" aria-hidden>
                <IconMic />
              </span>
              <span>音视频</span>
            </button>
            <button
              type="button"
              className="im-plus-item"
              disabled={uploading || sending || !online}
              onClick={() => {
                setPlusAccept(
                  'image/jpeg,image/png,image/webp,image/gif,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv',
                );
                setPlusOpen(false);
                requestAnimationFrame(() => fileInputRef.current?.click());
              }}
            >
              <span className="im-plus-icon" aria-hidden>
                <IconFile />
              </span>
              <span>文件</span>
            </button>
          </div>
        ) : null}
        <input
          ref={fileInputRef}
          type="file"
          accept={plusAccept}
          hidden
          tabIndex={-1}
          disabled={uploading || sending || !online}
          onChange={(e) => {
            void sendFile(e.target.files);
            e.target.value = '';
          }}
        />
          </>
        )}
        <ImVoiceRecordHud
          open={Boolean(recording && useRecorder)}
          cancelArmed={cancelArmed}
          elapsedSec={useRecorder ? recorder.elapsedSec : 0}
        />
      </div>

      {actionMsg && !actionMsg.recalled && actionItems.length > 0 ? (
        <ImMsgActionPopover
          open
          anchorEl={actionAnchor}
          align={actionMine ? 'end' : 'start'}
          actions={actionItems}
          onClose={closeMsgActions}
          quickEmojis={!actionMsg.pending && !actionMsg.sendFailed ? QUICK_EMOJIS : undefined}
          phraseKeys={!actionMsg.pending && !actionMsg.sendFailed ? QUICK_PHRASES : undefined}
          onEmoji={
            !actionMsg.pending && !actionMsg.sendFailed
              ? (e) => void react(actionMsg.id, e)
              : undefined
          }
        />
      ) : null}

      {lightbox ? (
        <ImImageLightbox
          images={lightbox.images}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onIndexChange={(i) => setLightbox((prev) => (prev ? { ...prev, index: i } : prev))}
          onSave={(img) => void downloadImAsset(img.src, img.alt)}
          onShare={(img) => void shareImAsset(img.src, img.alt)}
          onForward={(img) => {
            openForward([
              {
                kind: 'image',
                body: '',
                attachments: [{ url: img.src, file_name: img.alt || 'image.jpg', mime: 'image/*' }],
              },
            ]);
            setLightbox(null);
          }}
        />
      ) : null}

      {filePreview ? (
        <ImFilePreviewSheet
          url={filePreview.url}
          fileName={filePreview.fileName}
          mime={filePreview.mime}
          storageKey={filePreview.storageKey}
          onClose={() => setFilePreview(null)}
        />
      ) : null}

      <ReportSheet
        open={Boolean(reportId)}
        busy={reportBusy}
        onClose={() => setReportId(null)}
        onSubmit={submitReport}
      />

      <ForwardPickerSheet
        open={forwardOpen}
        items={forwardItems}
        onClose={() => {
          setForwardOpen(false);
          exitSelectMode();
        }}
        onDone={() => setErr(null)}
      />

      <ImChatSearch
        open={searchOpen}
        scope="dm"
        refId={threadId}
        onClose={() => setSearchOpen(false)}
        onSelect={(mid) => setFocusOverride(mid)}
      />
    </main>
  );
}

export default function DmThreadPage() {
  return (
    <Suspense fallback={(
      <main className="container">
        <p className="muted">加载中…</p>
      </main>
    )}>
      <DmThreadPageInner />
    </Suspense>
  );
}
