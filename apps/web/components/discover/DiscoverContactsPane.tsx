'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  api,
  effectiveId,
  ensureAccountReady,
  type Friend,
  type FriendRequestItem,
  type Group,
} from '@/lib/api';
import ErrorBanner, { errorMessage } from '@/components/ErrorBanner';
import Avatar, { defaultAvatarId } from '@/components/Avatar';
import { FriendAvatar } from '@/components/discover/FriendAvatar';
import { markRouteNavigation } from '@/lib/pwa_tab_nav';
import { friendDisplayName, friendRequestLabel } from '@/lib/friend_label';
import { FRIEND_REMARKS_EVENT, friendRemarkOrName } from '@/lib/friend_remarks';
import { useOnline } from '@/lib/use_online';

function groupRoleLabel(role: string): string {
  if (role === 'owner') return '群主';
  if (role === 'admin') return '管理员';
  return '成员';
}

export default function DiscoverContactsPane() {
  const router = useRouter();
  const online = useOnline();
  const [uid, setUid] = useState<string | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupInviteCount, setGroupInviteCount] = useState(0);
  const [incoming, setIncoming] = useState<FriendRequestItem[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequestItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [remarkTick, setRemarkTick] = useState(0);

  const query = q.trim().toLowerCase();

  const filteredGroups = useMemo(() => {
    if (!query) return groups;
    return groups.filter((g) => {
      const name = (g.name || '').toLowerCase();
      const intro = (g.intro || '').toLowerCase();
      const code = (g.join_code || '').toLowerCase();
      const plan = (g.plan_title || '').toLowerCase();
      return name.includes(query) || intro.includes(query) || code.includes(query) || plan.includes(query);
    });
  }, [groups, query]);

  const filteredFriends = useMemo(() => {
    if (!query) return friends;
    return friends.filter((f) => {
      const name = friendRemarkOrName(f.user_id, friendDisplayName(f)).toLowerCase();
      const handle = (f.handle || '').toLowerCase();
      const raw = (f.display_name || '').toLowerCase();
      const code = (f.user_code || '').toLowerCase();
      return name.includes(query) || handle.includes(query) || raw.includes(query) || code.includes(query);
    });
  }, [friends, query, remarkTick]);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      const [fRes, gRes, reqRes, invRes] = await Promise.allSettled([
        api.friends(),
        api.myGroups(),
        api.friendRequests(),
        api.groupInviteInbox(),
      ]);
      if (fRes.status === 'fulfilled') {
        setFriends(Array.isArray(fRes.value.friends) ? fRes.value.friends : []);
      } else {
        throw fRes.reason;
      }
      if (gRes.status === 'fulfilled') {
        setGroups(Array.isArray(gRes.value.groups) ? gRes.value.groups : []);
      } else {
        setGroups([]);
      }
      if (reqRes.status === 'fulfilled') {
        setIncoming(Array.isArray(reqRes.value.incoming) ? reqRes.value.incoming : []);
        setOutgoing(Array.isArray(reqRes.value.outgoing) ? reqRes.value.outgoing : []);
      } else {
        setIncoming([]);
        setOutgoing([]);
      }
      if (invRes.status === 'fulfilled') {
        setGroupInviteCount(Array.isArray(invRes.value.invites) ? invRes.value.invites.length : 0);
      } else {
        setGroupInviteCount(0);
      }
      setErr(null);
    } catch (e) {
      if (online) setErr(errorMessage(e, '加载失败，请稍后再试'));
      else setErr(null);
    } finally {
      setLoading(false);
    }
  }, [online]);

  useEffect(() => {
    void ensureAccountReady().then(() => setUid(effectiveId() || null));
  }, []);

  useEffect(() => {
    const onRemark = () => setRemarkTick((n) => n + 1);
    window.addEventListener(FRIEND_REMARKS_EVENT, onRemark);
    return () => window.removeEventListener(FRIEND_REMARKS_EVENT, onRemark);
  }, []);

  useEffect(() => {
    if (!uid) return;
    void reload();
  }, [uid, reload]);

  const go = (href: string) => {
    markRouteNavigation();
    router.push(href);
  };

  if (!uid) {
    return <p className="muted" style={{ padding: '12px 0' }}>正在准备账号…</p>;
  }

  const showIncoming = !query && incoming.length > 0;
  const showOutgoing = !query && outgoing.length > 0;
  const showGroupInvites = !query && groupInviteCount > 0;

  return (
    <div className="discover-friends-pane">
      {err ? <ErrorBanner message={err} onRetry={() => void reload()} /> : null}

      <div className="discover-im-search" style={{ marginBottom: 12 }}>
        <input
          className="search-input"
          value={q}
          placeholder="搜索好友、群名或邀请码…"
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading && friends.length === 0 && groups.length === 0 && incoming.length === 0 ? (
        <p className="muted" style={{ padding: '8px 0' }}>加载中…</p>
      ) : null}

      {showGroupInvites ? (
        <section style={{ marginBottom: 16 }}>
          <button
            type="button"
            className="discover-conv-row discover-contacts-entry"
            onClick={() => go('/discover/invites')}
          >
            <span className="discover-conv-avatar scope-inbox_groups" aria-hidden>邀</span>
            <div className="discover-conv-main">
              <strong>群邀请</strong>
              <p className="muted discover-conv-sub">{groupInviteCount} 条待处理</p>
            </div>
            <span className="discover-conv-unread">{groupInviteCount}</span>
          </button>
        </section>
      ) : null}

      <section style={{ marginBottom: 20 }}>
        <div className="discover-contacts-section-head">
          <p className="section-label" style={{ margin: 0 }}>我的群</p>
          <div className="discover-contacts-section-actions">
            <button type="button" className="text-link" onClick={() => go('/group/create')}>
              新建
            </button>
            <button type="button" className="text-link" onClick={() => go('/discover/join')}>
              加入
            </button>
          </div>
        </div>
        {groups.length === 0 && !loading ? (
          <div className="discover-empty is-compact">
            <strong>还没有群</strong>
            <p className="muted">建群或输入邀请码加入共读群。</p>
            <div className="discover-empty-actions">
              <button type="button" className="btn" onClick={() => go('/group/create')}>
                新建群
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => go('/discover/join')}>
                加入群
              </button>
            </div>
          </div>
        ) : filteredGroups.length === 0 && groups.length > 0 ? (
          <p className="muted discover-empty-inline">无匹配群</p>
        ) : (
          <ul className="discover-conv-list">
            {filteredGroups.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  className="discover-conv-row"
                  onClick={() => go(`/discover/group/${g.id}`)}
                >
                  <span className="friend-avatar" style={{ width: 40, height: 40, flexShrink: 0 }} aria-hidden>
                    <Avatar id={defaultAvatarId(g.id)} size={40} />
                  </span>
                  <div className="discover-conv-main">
                    <strong>{g.name}</strong>
                    <p className="muted discover-conv-sub">
                      {groupRoleLabel(g.role)}
                      {g.members ? ` · ${g.members} 人` : ''}
                      {g.plan_title ? ` · ${g.plan_title}` : ''}
                    </p>
                  </div>
                  <span className="muted" aria-hidden>›</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {showIncoming ? (
        <section style={{ marginBottom: 16 }}>
          <p className="section-label">新的朋友</p>
          <ul className="discover-conv-list">
            {incoming.map((r) => (
              <li key={r.id} className="card card-2" style={{ padding: 12, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <strong>{friendRequestLabel(r)}</strong>
                    {r.user_code && friendRequestLabel(r) !== `ID ${r.user_code}` ? (
                      <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
                        ID {r.user_code}
                      </p>
                    ) : r.handle && friendRequestLabel(r) !== `@${r.handle}` ? (
                      <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
                        @{r.handle}
                      </p>
                    ) : null}
                    {r.message ? (
                      <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                        附言：{r.message}
                      </p>
                    ) : null}
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

      {showOutgoing ? (
        <section style={{ marginBottom: 16 }}>
          <p className="section-label">等待验证</p>
          <ul className="discover-conv-list">
            {outgoing.map((r) => (
              <li key={r.id} className="card card-2" style={{ padding: 12, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <strong>{friendRequestLabel(r)}</strong>
                    {r.user_code && friendRequestLabel(r) !== `ID ${r.user_code}` ? (
                      <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
                        ID {r.user_code}
                      </p>
                    ) : null}
                    {r.message ? (
                      <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                        附言：{r.message}
                      </p>
                    ) : (
                      <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                        已发送申请，等待对方同意
                      </p>
                    )}
                  </div>
                  <span className="muted" style={{ fontSize: 13, flexShrink: 0 }}>待同意</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <div className="discover-contacts-section-head">
          <p className="section-label" style={{ margin: 0 }}>好友</p>
          <button type="button" className="text-link" onClick={() => go('/friend/add')}>
            加好友
          </button>
        </div>
        {friends.length === 0 && !loading ? (
          <div className="discover-empty is-compact">
            <strong>还没有好友</strong>
            <p className="muted">申请通过后可私信。</p>
            <div className="discover-empty-actions">
              <button type="button" className="btn" onClick={() => go('/friend/add')}>
                加好友
              </button>
            </div>
          </div>
        ) : filteredFriends.length === 0 && friends.length > 0 ? (
          <p className="muted discover-empty-inline">无匹配好友</p>
        ) : (
          <ul className="discover-conv-list">
            {filteredFriends.map((f) => {
              const name = friendRemarkOrName(f.user_id, friendDisplayName(f));
              const sub =
                f.handle && name !== f.handle
                  ? `@${f.handle}`
                  : f.user_code
                    ? `ID ${f.user_code}`
                    : '查看资料 · 发私信';
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
                      <p className="muted discover-conv-sub">{sub}</p>
                    </div>
                    <span className="muted" aria-hidden>›</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
