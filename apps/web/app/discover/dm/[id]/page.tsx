'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import PageBackBar from '@/components/PageBackBar';
import { api, contentAssetUrl, effectiveId, ensureAccountReady, type DmMessage } from '@/lib/api';
import ErrorBanner, { errorMessage } from '@/components/ErrorBanner';
import { ReportSheet, type ReportReason } from '@/components/social/ReportSheet';
import { ImMessageBody } from '@/components/social/ImMessageBody';
import { ImActionMenu } from '@/components/social/ImActionMenu';
import { ForwardPickerSheet, type ForwardPayload } from '@/components/social/ForwardPickerSheet';
import { canRecallOwnMessage, copyMessageText, focusMessageById, formatMsgDayLabel, formatMsgTime, localDayKeyFromIso, replySnippet } from '@/lib/im_ui';
import { ImAttachPreview } from '@/components/social/ImAttachPreview';
import {
  IconClose,
  IconFile,
  IconImage,
  IconPlus,
} from '@/components/social/ImComposerIcons';
import { autosizeTextarea, type PendingAttach } from '@/lib/im_composer';
import { clearImDraft, getImDraftRecord, setImDraftRecord } from '@/lib/im_drafts';
import {
  dequeueFailedText,
  enqueueFailedText,
  listFailedText,
  peekMediaFile,
  rememberMediaFile,
  takeMediaFile,
} from '@/lib/im_send_queue';
import { useFocusMessage } from '@/lib/use_focus_message';
import { subscribeSocialRealtime } from '@/lib/social_realtime';
import { useOnline } from '@/lib/use_online';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';

type LocalDm = DmMessage & {
  pending?: boolean;
  sendFailed?: boolean;
  retryText?: string;
};

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
  useFocusMessage(focusMsg);
  useEdgeSwipeBack({ href: '/discover' });
  const online = useOnline();
  const threadId = id;
  const [uid, setUid] = useState<string | null>(null);
  const [title, setTitle] = useState('私信');
  const [msgs, setMsgs] = useState<LocalDm[]>([]);
  const [peerLastRead, setPeerLastRead] = useState<string | null>(null);
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
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardItems, setForwardItems] = useState<ForwardPayload[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const stickBottom = useRef(true);
  const wasOffline = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [plusAccept, setPlusAccept] = useState(
    'image/jpeg,image/png,image/webp,image/gif,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx',
  );
  const [pending, setPending] = useState<PendingAttach | null>(null);
  const msgsRef = useRef(msgs);
  msgsRef.current = msgs;
  const sendBodyRef = useRef<
    (body: string, replyId?: string, replaceTempId?: string) => Promise<boolean>
  >(async () => false);

  const byId = useMemo(() => {
    const map = new Map<string, LocalDm>();
    for (const m of msgs) map.set(m.id, m);
    return map;
  }, [msgs]);

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

  const loadTitle = useCallback(async () => {
    if (!threadId) return;
    try {
      const conv = await api.conversations();
      const hit = conv.items.find((it) => it.scope === 'dm' && it.ref_id === threadId);
      if (hit?.title) setTitle(hit.title);
    } catch {
      /* ignore */
    }
  }, [threadId]);

  const reload = useCallback(async () => {
    if (!threadId) return;
    try {
      const r = await api.dmMessages(threadId);
      const incoming = (r.messages || []) as LocalDm[];
      setPeerLastRead(r.peer_last_read_at ?? null);
      setMsgs((prev) => {
        const temps = prev.filter((m) => m.id.startsWith('temp-'));
        if (!temps.length) return incoming;
        const merged = [...incoming];
        for (const t of temps) {
          const dup = merged.some(
            (m) =>
              m.sender_id === t.sender_id
              && (m.body || '') === (t.body || '')
              && m.kind === t.kind
              && Math.abs(
                new Date(m.created_at || 0).getTime() - new Date(t.created_at || 0).getTime(),
              ) < 120000,
          );
          if (!dup) merged.push(t);
        }
        return merged;
      });
      void api.patchConversationState('dm', threadId, {});
      setErr(null);
    } catch (e) {
      setErr(errorMessage(e, '加载失败'));
    }
  }, [threadId]);

  useEffect(() => {
    void ensureAccountReady().then(() => setUid(effectiveId() || null));
  }, []);

  useEffect(() => {
    if (!uid || !threadId) return;
    void reload();
    void loadTitle();
  }, [uid, threadId, reload, loadTitle]);

  useEffect(() => {
    if (!uid || !threadId) return;
    return subscribeSocialRealtime((_c, changed) => {
      if (changed) void reload();
    });
  }, [uid, threadId, reload]);

  useEffect(() => {
    if (!stickBottom.current) return;
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs.length]);

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
    setShowJump(dist > 120);
  };

  const jumpBottom = () => {
    stickBottom.current = true;
    setShowJump(false);
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
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

  const resend = async (m: LocalDm) => {
    if (m.sendFailed && m.retryText) {
      await sendBody(m.retryText, m.reply_to_id || undefined, m.id);
      return;
    }
    const file = peekMediaFile(m.id);
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
    try {
      const meta = await api.uploadSocialMedia(file, {
        onProgress: (pct) => setUploadPct(pct),
      });
      await api.sendDmMedia(threadId, {
        storage_key: meta.storage_key,
        file_name: meta.file_name,
        mime: meta.mime_type,
        size_bytes: meta.size_bytes,
        url: meta.url,
        body: caption,
        reply_to_id: replyId,
      });
      takeMediaFile(tempId);
      await reload();
    } catch (e) {
      rememberMediaFile(tempId, file);
      setMsgs((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, pending: false, sendFailed: true } : m,
        ),
      );
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
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
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
    const isImg = file.type.startsWith('image/');
    setMsgs((prev) => [
      ...prev,
      {
        id: tempId,
        sender_id: uid,
        kind: isImg ? 'image' : 'file',
        body: caption,
        reply_to_id: replyId || null,
        created_at: new Date().toISOString(),
        pending: true,
      },
    ]);
    try {
      const meta = await api.uploadSocialMedia(file, {
        onProgress: (pct) => setUploadPct(pct),
      });
      await api.sendDmMedia(threadId, {
        storage_key: meta.storage_key,
        file_name: meta.file_name,
        mime: meta.mime_type,
        size_bytes: meta.size_bytes,
        url: meta.url,
        body: caption,
        reply_to_id: replyId,
      });
      setText('');
      clearImDraft('dm', threadId);
      setReplyTo(null);
      clearPending();
      await reload();
    } catch (e) {
      rememberMediaFile(tempId, file);
      setMsgs((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, pending: false, sendFailed: true } : m)),
      );
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

  const submitReport = async (reason: ReportReason) => {
    if (!reportId) return;
    setReportBusy(true);
    try {
      await api.reportContent('dm', reportId, reason);
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
      items.push({ body: m.body, kind: m.kind, ref: m.ref });
    }
    if (items.length) openForward(items);
  };

  const isRead = (createdAt?: string | null) => {
    if (!peerLastRead || !createdAt) return false;
    return new Date(createdAt).getTime() <= new Date(peerLastRead).getTime();
  };

  return (
    <main className="container dm-page">
      <header className="dm-page-head">
        <PageBackBar href="/discover" label="消息" />
        <h1 className="dm-page-title">{title}</h1>
        {!selectMode ? (
          <button
            type="button"
            className="text-link"
            style={{ fontSize: 13, marginLeft: 'auto' }}
            onClick={() => setSelectMode(true)}
          >
            多选
          </button>
        ) : null}
      </header>

      {selectMode ? (
        <div className="im-select-toolbar">
          <button type="button" className="text-link" onClick={exitSelectMode}>
            取消
          </button>
          <span className="muted">已选 {selectedIds.size} 条</span>
          <button
            type="button"
            className="btn"
            disabled={selectedIds.size === 0}
            onClick={forwardSelected}
          >
            转发
          </button>
        </div>
      ) : null}

      {err ? <ErrorBanner message={err} onRetry={() => void reload()} /> : null}
      {!online ? (
        <p className="muted offline-page-hint">当前离线，私信需联网后收发。</p>
      ) : null}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div
          ref={listRef}
          className="dm-msg-list"
          onScroll={onListScroll}
        >
          {msgs.length === 0 ? (
            <div className="dm-empty">
              <strong>还没有消息</strong>
              <p className="muted">打个招呼，开始这段对话吧。</p>
            </div>
          ) : null}
          {msgs.map((m, idx) => {
            const mine = m.mine ?? m.sender_id === uid;
            const parent = m.reply_to_id ? byId.get(m.reply_to_id) : undefined;
            const dayKey = localDayKeyFromIso(m.created_at);
            const prevDay = idx > 0 ? localDayKeyFromIso(msgs[idx - 1]!.created_at) : '';
            const showDay = dayKey && dayKey !== prevDay;
            const showRecall = canRecallOwnMessage(m.created_at, {
              mine,
              recalled: m.recalled,
            });
            const selected = selectedIds.has(m.id);
            const canSelect = selectMode && !m.recalled && !m.pending && !m.id.startsWith('temp-');
            const actionItems = !m.pending && !m.sendFailed && !m.recalled
              ? [
                  ...(m.body || m.ref
                    ? [{
                        label: '复制',
                        onClick: () => void copyMessageText([m.ref, m.body]),
                      }]
                    : []),
                  {
                    label: '回复',
                    onClick: () => {
                      setReplyTo({
                        id: m.id,
                        snippet: replySnippet(m.body, m.kind, m.attachments?.[0]?.file_name),
                      });
                    },
                  },
                  ...(showRecall
                    ? [{
                        label: '撤回',
                        onClick: () => void recall(m.id),
                      }]
                    : []),
                  ...(!mine
                    ? [{
                        label: '举报',
                        onClick: () => setReportId(m.id),
                      }]
                    : []),
                  {
                    label: '转发',
                    onClick: () =>
                      openForward([{ body: m.body, kind: m.kind, ref: m.ref }]),
                  },
                ]
              : [];

            return (
              <div key={m.id} className="dm-msg-block">
                {showDay ? (
                  <div className="dm-day-sep" role="separator">
                    <span>{formatMsgDayLabel(dayKey)}</span>
                  </div>
                ) : null}
                <div
                  data-mid={m.id}
                  className={`dm-msg-row${mine ? ' is-mine' : ' is-peer'}${m.pending ? ' is-pending' : ''}${m.sendFailed ? ' is-failed' : ''}`}
                  onClick={() => {
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
                <div className="dm-bubble">
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
                          {m.attachments.map((a) => {
                            const href = a.url ? contentAssetUrl(a.url) : null;
                            const isImg = (a.mime || '').startsWith('image/') || m.kind === 'image';
                            if (isImg && href) {
                              return (
                                <a key={a.id} href={href} target="_blank" rel="noreferrer">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={href} alt={a.file_name || '图片'} />
                                </a>
                              );
                            }
                            return href ? (
                              <a
                                key={a.id}
                                href={href}
                                download={a.file_name || undefined}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {a.file_name || '附件'}
                                {a.size_bytes ? (
                                  <span className="im-attach-dl">{formatSize(a.size_bytes)}</span>
                                ) : null}
                              </a>
                            ) : (
                              <span key={a.id}>
                                {a.file_name || '附件'}
                                {a.size_bytes ? (
                                  <span className="im-attach-dl">{formatSize(a.size_bytes)}</span>
                                ) : null}
                              </span>
                            );
                          })}
                        </div>
                      ) : null}
                      <div className="dm-bubble-foot">
                        <span className="dm-bubble-time muted">
                          {m.pending
                            ? '发送中…'
                            : m.sendFailed
                              ? '发送失败'
                              : formatMsgTime(m.created_at)}
                        </span>
                        {m.sendFailed ? (
                          <button
                            type="button"
                            className="text-link"
                            style={{ fontSize: 12 }}
                            onClick={() => void resend(m)}
                          >
                            重发
                          </button>
                        ) : null}
                        {m.sendFailed ? (
                          <button
                            type="button"
                            className="text-link danger"
                            style={{ fontSize: 12 }}
                            onClick={() => {
                              dequeueFailedText(m.id);
                              takeMediaFile(m.id);
                              setMsgs((prev) => prev.filter((x) => x.id !== m.id));
                            }}
                          >
                            删除
                          </button>
                        ) : null}
                        {mine && !m.pending && !m.sendFailed && !m.recalled ? (
                          <span className="im-read-receipt">
                            {isRead(m.created_at) ? '已读' : '已送达'}
                          </span>
                        ) : null}
                        {!selectMode && actionItems.length ? (
                          <ImActionMenu items={actionItems} />
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
        {showJump ? (
          <button type="button" className="im-jump-bottom" onClick={jumpBottom}>
            回到底部
          </button>
        ) : null}
      </div>

      <div className="im-composer-bar dm-composer-dock">
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
            onCancel={clearPending}
            onConfirm={() => void confirmPending()}
          />
        ) : null}
        <div className="im-composer-row">
          <div className={`im-composer-field-wrap${!online ? ' is-offline' : ''}`}>
            <textarea
              ref={inputRef}
              className="im-composer-field input im-composer-textarea"
              value={text}
              rows={1}
              placeholder={online ? (replyTo ? '回复…' : '发消息…') : '离线不可发，联网后继续'}
              disabled={!online || sending || uploading}
              onChange={(e) => setText(e.target.value)}
              onFocus={() => setPlusOpen(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
          </div>
          {text.trim() && !pending ? (
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
                if (next) inputRef.current?.blur();
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
                  'image/jpeg,image/png,image/webp,image/gif,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx',
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
          disabled={uploading || sending || !online}
          onChange={(e) => {
            void sendFile(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

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
