'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { subscribeSocialRealtime } from '@/lib/social_realtime';
import { useOnline } from '@/lib/use_online';
import {
  dequeueFailedText,
  enqueueFailedText,
  listFailedText,
} from '@/lib/im_send_queue';

type Scope = 'group' | 'dm';

export interface ImThreadConfig<TMsg extends { id: string }> {
  scope: Scope;
  refId: string;
  uid: string | null;
  fetchPage: (opts: { limit: number; before?: string }) => Promise<{
    messages: TMsg[];
    has_more?: boolean;
  }>;
  sendMessage: (body: string, replyId?: string) => Promise<void>;
  mapOptimistic: (tempId: string, body: string, replyId?: string) => TMsg;
  markFailed: (msg: TMsg) => TMsg;
  markPending: (msg: TMsg, body: string) => TMsg;
}

/** E5：DM / 群 IM 共享线程逻辑 */
export function useImThread<TMsg extends { id: string }>(config: ImThreadConfig<TMsg>) {
  const { scope, refId, uid, fetchPage, sendMessage, mapOptimistic, markFailed, markPending } =
    config;
  const online = useOnline();
  const [msgs, setMsgs] = useState<TMsg[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sending, setSending] = useState(false);
  const msgsRef = useRef<TMsg[]>([]);
  const hasMoreRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const wasOffline = useRef(false);
  const sendBodyRef = useRef<
    (body: string, replyId?: string, replaceTempId?: string) => Promise<boolean>
  >(() => Promise.resolve(false));

  const reload = useCallback(async () => {
    if (!refId) return;
    try {
      const r = await fetchPage({ limit: 50 });
      const list = r.messages || [];
      msgsRef.current = list;
      setMsgs(list);
      hasMoreRef.current = Boolean(r.has_more);
      setHasMore(Boolean(r.has_more));
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败');
    }
  }, [refId, fetchPage]);

  const loadMore = useCallback(async () => {
    if (!refId || loadingMoreRef.current || !hasMoreRef.current) return false;
    const oldest = msgsRef.current[0]?.id;
    if (!oldest) return false;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const r = await fetchPage({ limit: 50, before: oldest });
      const older = r.messages || [];
      setMsgs((prev) => {
        const next = [...older, ...prev];
        msgsRef.current = next;
        return next;
      });
      hasMoreRef.current = Boolean(r.has_more);
      setHasMore(Boolean(r.has_more));
      return Boolean(r.has_more);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载更多失败');
      return hasMoreRef.current;
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [refId, fetchPage]);

  useEffect(() => {
    if (!uid || !refId) return;
    void reload();
  }, [uid, refId, reload]);

  useEffect(() => {
    if (!uid || !refId) return;
    return subscribeSocialRealtime(
      (_c, changed) => {
        if (changed) void reload();
      },
      { watch: scope === 'dm' ? 'dm' : 'group', debounceMs: 900 },
    );
  }, [uid, refId, reload, scope]);

  const sendBody = useCallback(
    async (body: string, replyId?: string, replaceTempId?: string): Promise<boolean> => {
      if (!online || !refId || !uid) return false;
      setSending(true);
      const tempId = replaceTempId || `temp-${Date.now()}`;
      if (!replaceTempId) {
        setMsgs((prev) => {
          const next = [...prev, mapOptimistic(tempId, body, replyId)];
          msgsRef.current = next;
          return next;
        });
      } else {
        setMsgs((prev) => {
          const next = prev.map((m) =>
            m.id === tempId ? markPending(m, body) : m,
          );
          msgsRef.current = next;
          return next;
        });
      }
      try {
        await sendMessage(body, replyId);
        dequeueFailedText(tempId);
        await reload();
        return true;
      } catch (e) {
        enqueueFailedText({
          id: tempId,
          scope,
          refId,
          body,
          replyToId: replyId,
        });
        setMsgs((prev) => {
          const next = prev.map((m) => (m.id === tempId ? markFailed(m) : m));
          msgsRef.current = next;
          return next;
        });
        setErr(e instanceof Error ? e.message : '发送失败');
        return false;
      } finally {
        setSending(false);
      }
    },
    [online, refId, uid, scope, sendMessage, reload, mapOptimistic, markFailed, markPending],
  );

  sendBodyRef.current = sendBody;

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (!wasOffline.current || !refId) return;
    wasOffline.current = false;
    const queued = listFailedText(scope, refId);
    for (const q of queued) {
      void sendBodyRef.current(q.body, q.replyToId, q.id);
    }
  }, [online, refId, scope]);

  return {
    msgs,
    setMsgs,
    msgsRef,
    err,
    setErr,
    hasMore,
    loadingMore,
    sending,
    reload,
    loadMore,
    sendBody,
  };
}
