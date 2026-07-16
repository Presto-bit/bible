'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOnline } from '@/lib/use_online';
import {
  api,
  effectiveId,
  ensureAccountReady,
  type ConversationItem,
  type Friend,
} from '@/lib/api';
import ErrorBanner, { errorMessage } from '@/components/ErrorBanner';
import Avatar, { defaultAvatarId } from '@/components/Avatar';
import { FriendAvatar } from '@/components/discover/FriendAvatar';
import { markRouteNavigation } from '@/lib/pwa_tab_nav';
import { subscribeSocialRealtime } from '@/lib/social_realtime';
import { friendDisplayName } from '@/lib/friend_label';
import { FRIEND_REMARKS_EVENT, dmTitleWithRemark } from '@/lib/friend_remarks';
import { formatConvListTime } from '@/lib/im_ui';
import { SwipeRevealRow } from '@/components/SwipeRevealRow';
import { timedPerf } from '@/lib/perf_rum';

function ConversationAvatar({
  it,
  friend,
}: {
  it: ConversationItem;
  friend?: Friend | null;
}) {
  if (it.scope === 'dm') {
    return (
      <FriendAvatar
        friend={{
          user_id: it.peer_user_id || it.ref_id,
          avatar_id: friend?.avatar_id || it.peer_avatar_id,
        }}
        size={40}
      />
    );
  }
  if (it.scope === 'group') {
    return (
      <span className="friend-avatar" style={{ width: 40, height: 40, flexShrink: 0 }} aria-hidden>
        <Avatar id={defaultAvatarId(it.ref_id)} size={40} />
      </span>
    );
  }
  return (
    <span className={`discover-conv-avatar scope-${it.scope}`} aria-hidden>
      {it.scope === 'inbox_friends' ? '友' : '通'}
    </span>
  );
}

type SearchHit = {
  scope: string;
  message_id: string;
  ref_id: string;
  title: string;
  kind: string;
  snippet: string;
  created_at?: string | null;
};

export default function DiscoverTab({ paneActive = true }: { paneActive?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const online = useOnline();
  const [uid, setUid] = useState<string | null>(null);
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState('');
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [remarkTick, setRemarkTick] = useState(0);
  const plusRef = useRef<HTMLDivElement | null>(null);
  const messagesLoadedRef = useRef(false);
  const reloadGenRef = useRef(0);

  const friendsById = useMemo(() => {
    const map = new Map<string, Friend>();
    for (const f of friends) map.set(f.user_id, f);
    return map;
  }, [friends]);

  const contactsBadge = useMemo(() => {
    let n = 0;
    for (const i of items) {
      if (i.scope === 'inbox_friends' || i.scope === 'inbox_groups') {
        n += i.unread || 0;
      }
    }
    return n;
  }, [items]);

  const reload = useCallback(async () => {
    const gen = ++reloadGenRef.current;
    const soft = messagesLoadedRef.current;
    try {
      if (!soft) setLoading(true);
      await timedPerf('discover.reload.messages', async () => {
        const [conv, fRes] = await Promise.all([
          api.conversations(),
          api.friends().catch(() => null),
        ]);
        if (gen !== reloadGenRef.current) return;
        setItems(Array.isArray(conv.items) ? conv.items : []);
        if (fRes) setFriends(Array.isArray(fRes.friends) ? fRes.friends : []);
        messagesLoadedRef.current = true;
      });
      setErr(null);
    } catch (e) {
      if (gen !== reloadGenRef.current) return;
      if (online) setErr(errorMessage(e, '刷新失败，请稍后再试'));
      else setErr(null);
    } finally {
      if (gen === reloadGenRef.current) setLoading(false);
    }
  }, [online]);

  useEffect(() => {
    if (!paneActive) return;
    void ensureAccountReady().then(() => setUid(effectiveId() || null));
  }, [paneActive]);

  useEffect(() => {
    const onRemark = () => setRemarkTick((n) => n + 1);
    window.addEventListener(FRIEND_REMARKS_EVENT, onRemark);
    return () => window.removeEventListener(FRIEND_REMARKS_EVENT, onRemark);
  }, []);

  useEffect(() => {
    if (!paneActive || typeof window === 'undefined') return;
    if (pathname !== '/discover') return;
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'friends') {
      router.replace('/discover/contacts');
    }
  }, [paneActive, pathname, router]);

  useEffect(() => {
    if (!plusOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (plusRef.current && !plusRef.current.contains(e.target as Node)) {
        setPlusOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [plusOpen]);

  useEffect(() => {
    if (!uid || !paneActive || pathname !== '/discover') return;
    void reload();
  }, [uid, paneActive, pathname, reload]);

  useEffect(() => {
    if (!uid || !paneActive) return;
    return subscribeSocialRealtime(
      (_c, changed) => {
        if (changed) void reload();
      },
      { watch: 'all', debounceMs: 900 },
    );
  }, [uid, paneActive, reload]);

  useEffect(() => {
    if (searchQ.trim().length < 1) {
      setSearchHits([]);
      return;
    }
    const q = searchQ.trim();
    const t = window.setTimeout(() => {
      setSearchBusy(true);
      void api
        .searchMessages(q)
        .then((r) => setSearchHits(r.items || []))
        .catch(() => setSearchHits([]))
        .finally(() => setSearchBusy(false));
    }, 320);
    return () => window.clearTimeout(t);
  }, [searchQ]);

  const go = (href: string) => {
    markRouteNavigation();
    router.push(href);
  };

  const openItem = (it: ConversationItem) => {
    if (it.scope === 'group' || it.scope === 'dm') {
      go(it.scope === 'group' ? `/discover/group/${it.ref_id}` : `/discover/dm/${it.ref_id}`);
      if ((it.unread || 0) > 0) {
        setItems((prev) =>
          prev.map((row) =>
            row.scope === it.scope && row.ref_id === it.ref_id
              ? { ...row, unread: 0 }
              : row,
          ),
        );
      }
      void api.patchConversationState(it.scope, it.ref_id, {});
      return;
    }
    if (it.scope === 'inbox_friends') {
      go('/discover/contacts');
      return;
    }
    if (it.scope === 'inbox_groups') {
      go('/discover/invites');
      return;
    }
  };

  const patchState = async (
    it: ConversationItem,
    patch: { pinned?: boolean; muted?: boolean; hidden?: boolean },
  ) => {
    if (it.scope !== 'group' && it.scope !== 'dm') return;
    setErr(null);
    if (patch.hidden) {
      setItems((prev) =>
        prev.filter((row) => !(row.scope === it.scope && row.ref_id === it.ref_id)),
      );
    } else {
      setItems((prev) =>
        prev.map((row) =>
          row.scope === it.scope && row.ref_id === it.ref_id
            ? {
                ...row,
                pinned: patch.pinned ?? row.pinned,
                muted: patch.muted ?? row.muted,
              }
            : row,
        ),
      );
    }
    try {
      await api.patchConversationState(it.scope, it.ref_id, patch);
      if (patch.pinned !== undefined && !patch.hidden) void reload();
    } catch (e) {
      setErr(errorMessage(e, '设置失败'));
      void reload();
    }
  };

  const hideConversation = async (it: ConversationItem) => {
    await patchState(it, { hidden: true });
  };

  const openSearchHit = (h: SearchHit) => {
    setSearchQ('');
    const q = h.message_id.startsWith('title:') ? '' : `?focusMsg=${encodeURIComponent(h.message_id)}`;
    if (h.scope === 'group') go(`/discover/group/${h.ref_id}${q}`);
    else if (h.scope === 'dm') go(`/discover/dm/${h.ref_id}${q}`);
  };

  const searching = searchQ.trim().length > 0;

  if (!uid) {
    return (
      <main className="container">
        <div className="card card-2">
          <p>正在准备本机账号…</p>
          <Link className="btn" href="/profile">前往我的</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container discover-page discover-im">
      {!online ? (
        <p className="muted offline-page-hint">当前离线，消息需联网后刷新。</p>
      ) : null}
      {err ? <ErrorBanner message={err} onRetry={() => void reload()} /> : null}

      <div className="discover-im-top">
        <h1 className="discover-im-title">消息</h1>
        <div className="discover-im-actions" ref={plusRef}>
          <button
            type="button"
            className="discover-im-contacts"
            aria-label="通讯录"
            onClick={() => go('/discover/contacts')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="9" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="17" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.8" />
              <path
                d="M3.5 19.5c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M14.5 17.5c.4-1.8 1.8-3 3.5-3s3.1 1.2 3.5 3"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            {contactsBadge > 0 ? (
              <span className="discover-im-contacts-badge">
                {contactsBadge > 99 ? '99+' : contactsBadge}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            className={`discover-im-plus${plusOpen ? ' is-open' : ''}`}
            aria-label="更多"
            aria-expanded={plusOpen}
            onClick={() => setPlusOpen((v) => !v)}
          >
            ＋
          </button>
          {plusOpen ? (
            <div className="discover-im-plus-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setPlusOpen(false);
                  go('/group/create');
                }}
              >
                新建群
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setPlusOpen(false);
                  go('/discover/join');
                }}
              >
                加入群
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setPlusOpen(false);
                  go('/friend/add');
                }}
              >
                加好友
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="discover-im-search">
        <input
          className="search-input"
          value={searchQ}
          placeholder="搜索会话名或近 30 天消息…"
          onChange={(e) => setSearchQ(e.target.value)}
        />
        {searchBusy ? <p className="muted" style={{ margin: '8px 0 0', fontSize: 13 }}>搜索中…</p> : null}
        {!searchBusy && searching && searchHits.length === 0 ? (
          <p className="muted" style={{ margin: '8px 0 0', fontSize: 13 }}>无匹配结果</p>
        ) : null}
        {searchHits.length > 0 ? (
          <ul className="discover-search-list">
            {searchHits.map((h) => (
              <li key={`${h.scope}:${h.message_id}`}>
                <button type="button" className="discover-search-hit" onClick={() => openSearchHit(h)}>
                  <strong>{h.title}</strong>
                  <span className="muted">{h.snippet || h.kind}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {loading && items.length === 0 ? (
        <p className="muted" style={{ padding: '12px 0' }}>加载中…</p>
      ) : null}

      {!searching && (!loading || items.length > 0) ? (
        items.length === 0 ? (
          <div className="discover-empty">
            <strong>还没有消息</strong>
            <p className="muted">
              加好友后可私信，建群后可打卡与闲聊。消息与附件仅保留近 30 天。
            </p>
            <div className="discover-empty-actions">
              <button type="button" className="btn" onClick={() => go('/friend/add')}>加好友</button>
              <button type="button" className="btn btn-ghost" onClick={() => go('/discover/contacts')}>
                通讯录
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => go('/group/create')}>新建群</button>
            </div>
          </div>
        ) : (
          <ul className="discover-conv-list">
            {items.map((it) => {
              const key = `${it.scope}:${it.ref_id}`;
              const canState = it.scope === 'group' || it.scope === 'dm';
              const peerFriend =
                it.scope === 'dm' && it.peer_user_id
                  ? friendsById.get(it.peer_user_id)
                  : null;
              const title =
                it.scope === 'dm'
                  ? dmTitleWithRemark(
                      it.peer_user_id,
                      peerFriend
                        ? friendDisplayName(peerFriend)
                        : it.title,
                    )
                  : it.title;
              void remarkTick;
              const row = (
                <div className="discover-conv-row">
                  <ConversationAvatar it={it} friend={peerFriend} />
                  <div className="discover-conv-main">
                    <div className="discover-conv-title-row">
                      <div className="discover-conv-title-left">
                        {it.pinned ? <span className="discover-conv-pin">置顶</span> : null}
                        <strong>{title}</strong>
                        {it.muted ? <span className="discover-conv-mute">静音</span> : null}
                      </div>
                      {it.updated_at && (it.scope === 'group' || it.scope === 'dm') ? (
                        <time className="discover-conv-time" dateTime={it.updated_at}>
                          {formatConvListTime(it.updated_at)}
                        </time>
                      ) : null}
                    </div>
                    <div className="discover-conv-sub-row">
                      <p className="muted discover-conv-sub">
                        {it.subtitle || (it.scope === 'group' || it.scope === 'dm' ? '暂无消息' : '')}
                      </p>
                      {(it.unread || 0) > 0 ? (
                        <span className="discover-conv-unread">
                          {(it.unread || 0) > 99 ? '99+' : it.unread}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
              return (
                <li key={key} className="discover-conv-li">
                  {canState ? (
                    <SwipeRevealRow
                      onContentClick={() => openItem(it)}
                      actions={[
                        {
                          label: it.pinned ? '取消置顶' : '置顶',
                          tone: 'accent',
                          onClick: () => void patchState(it, { pinned: !it.pinned }),
                        },
                        {
                          label: it.muted ? '取消免打扰' : '免打扰',
                          tone: 'muted',
                          onClick: () => void patchState(it, { muted: !it.muted }),
                        },
                        {
                          label: '删除',
                          tone: 'danger',
                          onClick: () => void hideConversation(it),
                        },
                      ]}
                    >
                      {row}
                    </SwipeRevealRow>
                  ) : (
                    <div onClick={() => openItem(it)}>{row}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </main>
  );
}
