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
  type FriendRequestItem,
} from '@/lib/api';
import ErrorBanner, { errorMessage } from '@/components/ErrorBanner';
import { FriendAvatar } from '@/components/discover/FriendAvatar';
import { markRouteNavigation } from '@/lib/pwa_tab_nav';
import { subscribeSocialRealtime } from '@/lib/social_realtime';
import { friendDisplayName } from '@/lib/friend_label';
import { friendRemarkOrName } from '@/lib/friend_remarks';
import { SwipeRevealRow } from '@/components/SwipeRevealRow';

type SubTab = 'messages' | 'friends';

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
  const [sub, setSub] = useState<SubTab>('messages');
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<FriendRequestItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState('');
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [friendQ, setFriendQ] = useState('');
  const [plusOpen, setPlusOpen] = useState(false);
  const plusRef = useRef<HTMLDivElement | null>(null);
  const filteredFriends = useMemo(() => {
    const q = friendQ.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((f) => {
      const name = friendRemarkOrName(f.user_id, friendDisplayName(f)).toLowerCase();
      const handle = (f.handle || '').toLowerCase();
      const raw = (f.display_name || '').toLowerCase();
      return name.includes(q) || handle.includes(q) || raw.includes(q);
    });
  }, [friends, friendQ]);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      if (sub === 'messages') {
        const conv = await api.conversations();
        setItems(Array.isArray(conv.items) ? conv.items : []);
      } else {
        // 申请表缺迁移时不应拖垮整页好友列表
        const [fRes, reqRes] = await Promise.allSettled([
          api.friends(),
          api.friendRequests(),
        ]);
        if (fRes.status === 'fulfilled') {
          setFriends(Array.isArray(fRes.value.friends) ? fRes.value.friends : []);
        } else {
          throw fRes.reason;
        }
        if (reqRes.status === 'fulfilled') {
          setIncoming(Array.isArray(reqRes.value.incoming) ? reqRes.value.incoming : []);
        } else {
          setIncoming([]);
        }
      }
      setErr(null);
    } catch (e) {
      if (online) setErr(errorMessage(e, '加载失败，请检查网络'));
      else setErr(null);
    } finally {
      setLoading(false);
    }
  }, [online, sub]);

  useEffect(() => {
    if (!paneActive) return;
    void ensureAccountReady().then(() => setUid(effectiveId() || null));
  }, [paneActive]);

  useEffect(() => {
    if (!paneActive || typeof window === 'undefined') return;
    if (pathname !== '/discover') return;
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'friends') setSub('friends');
    else if (t === 'messages') setSub('messages');
  }, [paneActive, pathname]);

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
    if (!uid || !paneActive) return;
    void reload();
  }, [uid, paneActive, reload]);

  // 从建群/群页返回时 KeepAlive 可能不重挂载，按路由再刷一次
  useEffect(() => {
    if (!uid || !paneActive || pathname !== '/discover') return;
    void reload();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!uid || !paneActive || sub !== 'messages') return;
    return subscribeSocialRealtime((_c, changed) => {
      if (changed) void reload();
    });
  }, [uid, paneActive, sub, reload]);

  useEffect(() => {
    if (sub !== 'messages' || searchQ.trim().length < 1) {
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
  }, [sub, searchQ]);

  const go = (href: string) => {
    markRouteNavigation();
    router.push(href);
  };

  const openItem = (it: ConversationItem) => {
    if (it.scope === 'group') {
      void api.patchConversationState('group', it.ref_id, {});
      go(`/discover/group/${it.ref_id}`);
      return;
    }
    if (it.scope === 'dm') {
      void api.patchConversationState('dm', it.ref_id, {});
      go(`/discover/dm/${it.ref_id}`);
      return;
    }
    if (it.scope === 'inbox_friends') {
      setSub('friends');
      return;
    }
    if (it.scope === 'inbox_groups') {
      go('/discover/invites');
    }
  };

  const patchState = async (
    it: ConversationItem,
    patch: { pinned?: boolean; muted?: boolean },
  ) => {
    if (it.scope !== 'group' && it.scope !== 'dm') return;
    setErr(null);
    try {
      await api.patchConversationState(it.scope, it.ref_id, patch);
      await reload();
    } catch (e) {
      setErr(errorMessage(e, '设置失败'));
    }
  };

  const openSearchHit = (h: SearchHit) => {
    setSearchQ('');
    const q = h.message_id.startsWith('title:') ? '' : `?focusMsg=${encodeURIComponent(h.message_id)}`;
    if (h.scope === 'group') go(`/discover/group/${h.ref_id}${q}`);
    else if (h.scope === 'dm') go(`/discover/dm/${h.ref_id}${q}`);
  };

  const searching = sub === 'messages' && searchQ.trim().length > 0;

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

  const msgUnreadHint = items.some((i) => (i.unread || 0) > 0);

  return (
    <main className="container discover-page discover-im">
      {!online ? (
        <p className="muted offline-page-hint">当前离线，消息需联网后刷新。</p>
      ) : null}
      {err ? <ErrorBanner message={err} onRetry={() => void reload()} /> : null}

      <div className="discover-im-top">
        <div className="discover-im-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={sub === 'messages' ? 'is-active' : ''}
            aria-selected={sub === 'messages'}
            onClick={() => {
              setSub('messages');
              setPlusOpen(false);
              if (pathname === '/discover') router.replace('/discover', { scroll: false });
            }}
          >
            消息{msgUnreadHint && sub !== 'messages' ? <span className="discover-im-dot" /> : null}
          </button>
          <button
            type="button"
            role="tab"
            className={sub === 'friends' ? 'is-active' : ''}
            aria-selected={sub === 'friends'}
            onClick={() => {
              setSub('friends');
              setPlusOpen(false);
              if (pathname === '/discover') router.replace('/discover?tab=friends', { scroll: false });
            }}
          >
            好友
          </button>
        </div>
        <div className="discover-im-actions" ref={plusRef}>
          <button
            type="button"
            className={`discover-im-plus${plusOpen ? ' is-open' : ''}`}
            aria-label={sub === 'messages' ? '更多' : '加好友'}
            aria-expanded={sub === 'messages' ? plusOpen : undefined}
            onClick={() => {
              if (sub === 'friends') {
                go('/friend/add');
                return;
              }
              setPlusOpen((v) => !v);
            }}
          >
            ＋
          </button>
          {sub === 'messages' && plusOpen ? (
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
      {sub === 'messages' ? (
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
      ) : null}

      {loading ? <p className="muted" style={{ padding: '12px 0' }}>加载中…</p> : null}

      {sub === 'messages' && !loading && !searching ? (
        items.length === 0 ? (
          <div className="discover-empty">
            <strong>还没有消息</strong>
            <p className="muted">
              加好友后可私信，建群后可打卡与闲聊。消息与附件仅保留近 30 天。
            </p>
            <div className="discover-empty-actions">
              <button type="button" className="btn" onClick={() => go('/friend/add')}>加好友</button>
              <button type="button" className="btn btn-ghost" onClick={() => go('/group/create')}>新建群</button>
            </div>
          </div>
        ) : (
          <ul className="discover-conv-list">
            {items.map((it) => {
              const key = `${it.scope}:${it.ref_id}`;
              const canState = it.scope === 'group' || it.scope === 'dm';
              const row = (
                <button type="button" className="discover-conv-row">
                  <span className={`discover-conv-avatar scope-${it.scope}`} aria-hidden>
                    {it.scope === 'dm' ? '信' : it.scope === 'group' ? '群' : '通'}
                  </span>
                  <div className="discover-conv-main">
                    <div className="discover-conv-title-row">
                      {it.pinned ? <span className="discover-conv-pin">置顶</span> : null}
                      <strong>{it.title}</strong>
                      {it.muted ? <span className="discover-conv-mute">静音</span> : null}
                    </div>
                    <p className="muted discover-conv-sub">{it.subtitle || '暂无消息'}</p>
                  </div>
                  {(it.unread || 0) > 0 ? (
                    <span className="discover-conv-unread">{(it.unread || 0) > 99 ? '99+' : it.unread}</span>
                  ) : null}
                </button>
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

      {sub === 'friends' && !loading ? (
        <div className="discover-friends-pane">
          <div className="discover-im-search" style={{ marginBottom: 12 }}>
            <input
              className="search-input"
              value={friendQ}
              placeholder="搜索好友备注、昵称或用户名…"
              onChange={(e) => setFriendQ(e.target.value)}
            />
          </div>

          {incoming.length > 0 ? (
            <section style={{ marginBottom: 16 }}>
              <p className="section-label">新的朋友</p>
              <ul className="discover-conv-list">
                {incoming.map((r) => (
                  <li key={r.id} className="card card-2" style={{ padding: 12, marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                      <div>
                        <strong>{r.display_name || r.handle || r.from_user_id.slice(0, 8)}</strong>
                        {r.message ? <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>{r.message}</p> : null}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className="btn"
                          style={{ padding: '6px 10px', fontSize: 13 }}
                          onClick={() =>
                            void api.acceptFriendRequest(r.id).then(() => {
                              setErr(null);
                              void reload();
                            })
                          }
                        >
                          同意
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ padding: '6px 10px', fontSize: 13 }}
                          onClick={() => void api.declineFriendRequest(r.id).then(reload)}
                        >
                          拒绝
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <p className="section-label">好友</p>
          {friends.length === 0 ? (
            <div className="discover-empty is-compact">
              <strong>还没有好友</strong>
              <p className="muted">申请通过后可私信与邀群。</p>
              <div className="discover-empty-actions">
                <button type="button" className="btn" onClick={() => go('/friend/add')}>
                  加好友
                </button>
              </div>
            </div>
          ) : filteredFriends.length === 0 ? (
            <p className="muted discover-empty-inline">无匹配好友</p>
          ) : (
            <ul className="discover-conv-list">
              {filteredFriends.map((f) => {
                const name = friendRemarkOrName(f.user_id, friendDisplayName(f));
                return (
                  <li key={f.user_id}>
                    <button
                      type="button"
                      className="discover-conv-row"
                      onClick={() => go(`/discover/friends/${f.user_id}`)}
                    >
                      <FriendAvatar friend={f} size={40} />
                      <div className="discover-conv-main">
                        <strong>{name}</strong>
                        <p className="muted discover-conv-sub">
                          {f.handle ? `@${f.handle}` : '查看资料 · 发私信'}
                        </p>
                      </div>
                      <span className="muted" aria-hidden>›</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </main>
  );
}
