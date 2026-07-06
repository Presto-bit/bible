'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import PageBackBar from '@/components/PageBackBar';
import { AssistantLink } from '@/components/AssistantLink';
import ErrorBanner, { errorMessage } from '@/components/ErrorBanner';
import {
  api,
  effectiveId,
  ensureAccountReady,
  type Friend,
  type FriendActivity,
  type Group,
} from '@/lib/api';
import { friendDisplayName } from '@/lib/friend_label';
import { formatGroupRefLabel } from '@/lib/ref_label';
import { readerHrefFromRef } from '@/lib/group_footprint';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';

function reactionTotal(reactions: Record<string, string[]> | null | undefined): number {
  if (!reactions) return 0;
  return Object.values(reactions).reduce((n, users) => n + users.length, 0);
}

export default function FriendProfilePage() {
  const params = useParams();
  const router = useRouter();
  const friendId = String(params.id ?? '');
  useEdgeSwipeBack({ href: '/discover' });

  const [uid, setUid] = useState<string | null>(null);
  const [friend, setFriend] = useState<Friend | null>(null);
  const [activity, setActivity] = useState<FriendActivity[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [fRes, actRes, gRes] = await Promise.all([
        api.friends(),
        api.friendsActivity(),
        api.myGroups(),
      ]);
      const found = fRes.friends.find((f) => f.user_id === friendId) ?? null;
      setFriend(found);
      setActivity(actRes.items.filter((item) => item.author_id === friendId));
      setGroups(gRes.groups);
      setErr(found ? null : '未找到该好友');
    } catch (e) {
      setErr(errorMessage(e, '加载失败'));
    }
  }, [friendId]);

  useEffect(() => {
    void ensureAccountReady().then(() => setUid(effectiveId() || null));
  }, []);

  useEffect(() => {
    if (!uid || !friendId) return;
    void reload();
  }, [uid, friendId, reload]);

  const ownedGroups = useMemo(
    () => groups.filter((g) => g.role === 'owner' || g.role === 'admin'),
    [groups],
  );

  const inviteGroup = ownedGroups[0];

  if (!uid) {
    return (
      <main className="container">
        <p className="muted">正在准备账号…</p>
      </main>
    );
  }

  const name = friend ? friendDisplayName(friend) : '好友';

  return (
    <main className="container friend-profile-page">
      <header className="page-head">
        <PageBackBar href="/discover" label="发现" />
        <h2 className="page-head-title">{name}</h2>
      </header>

      {err && <ErrorBanner message={err} />}

      {friend && (
        <>
          <div className="card friend-profile-head">
            <div className="friend-profile-avatar" aria-hidden>{name.slice(0, 1)}</div>
            <div>
              <strong>{name}</strong>
              {friend.handle && (
                <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>@{friend.handle}</p>
              )}
            </div>
          </div>

          <div className="friend-profile-actions">
            {inviteGroup ? (
              <Link
                className="font-pill accent"
                href={`/discover/group/${inviteGroup.id}`}
              >
                邀请到「{inviteGroup.name}」
              </Link>
            ) : (
              <Link className="font-pill" href="/group/create">
                建群后邀请
              </Link>
            )}
            {activity[0]?.ref && (
              <AssistantLink
                className="font-pill"
                refParam={activity[0].ref}
                excerpt={activity[0].body || undefined}
              >
                问小爱 TA 在读什么
              </AssistantLink>
            )}
          </div>

          <div className="section-row" style={{ marginTop: 18 }}>
            <span>TA 的动态</span>
            <span className="muted" style={{ fontSize: 12 }}>打卡与分享</span>
          </div>

          {activity.length === 0 ? (
            <p className="muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
              暂无打卡或分享。好友在群内打卡、或主动分享想法/笔记后会出现在这里。
            </p>
          ) : (
            activity.map((s) => {
              const isShare = s.source === 'share';
              const refHref = s.ref ? readerHrefFromRef(s.ref) : null;
              const sourceLabel = isShare
                ? (s.kind === 'thought' ? '分享了想法' : '分享了笔记')
                : s.group_name;
              return (
                <div key={`${s.source}-${s.id}`} className="card share-card">
                  <div className="share-card-head">
                    <strong>{s.author}</strong>
                    {sourceLabel && (
                      <span className="muted" style={{ fontSize: 12 }}>{sourceLabel}</span>
                    )}
                  </div>
                  <p className="muted">{s.ref ? formatGroupRefLabel(s.ref) : (isShare ? '想法' : '打卡')}</p>
                  {s.body && <p style={{ marginTop: 6, lineHeight: 1.5 }}>{s.body}</p>}
                  <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                    ❤️ {reactionTotal(s.reactions)}
                  </p>
                  <div className="share-actions">
                    {s.ref && (
                      <AssistantLink className="font-pill" refParam={s.ref} excerpt={s.body || undefined}>
                        问小爱
                      </AssistantLink>
                    )}
                    {refHref && (
                      <Link className="font-pill" href={refHref}>我也在读</Link>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </>
      )}

      {!friend && !err && (
        <button type="button" className="btn" onClick={() => router.push('/discover')}>
          返回发现
        </button>
      )}
    </main>
  );
}
