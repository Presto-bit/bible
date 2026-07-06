'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import PageBackBar from '@/components/PageBackBar';
import { api, effectiveId, ensureAccountReady, type Friend } from '@/lib/api';
import { FriendAvatar } from '@/components/discover/FriendAvatar';
import { groupFriendsByLetter } from '@/lib/friend_sort';
import { friendDisplayName } from '@/lib/friend_label';
import { friendRemarkOrName } from '@/lib/friend_remarks';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import ErrorBanner, { errorMessage } from '@/components/ErrorBanner';

export default function FriendsListPage() {
  useEdgeSwipeBack({ href: '/discover' });
  const [uid, setUid] = useState<string | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const r = await api.friends();
      setFriends(r.friends);
      setErr(null);
    } catch (e) {
      setErr(errorMessage(e, '加载失败'));
    }
  }, []);

  useEffect(() => {
    void ensureAccountReady().then(() => setUid(effectiveId() || null));
  }, []);

  useEffect(() => {
    if (!uid) return;
    void reload();
  }, [uid, reload]);

  const groups = groupFriendsByLetter(friends);

  return (
    <main className="container friends-list-page">
      <header className="page-head">
        <PageBackBar href="/discover" label="发现" />
        <h2 className="page-head-title">我的好友</h2>
      </header>

      {err && <ErrorBanner message={err} onRetry={() => void reload()} />}

      <Link href="/friend/add" className="card friends-add-card">
        <span className="friends-add-icon" aria-hidden>+</span>
        <span>加好友</span>
      </Link>

      {friends.length === 0 ? (
        <p className="muted" style={{ marginTop: 16, lineHeight: 1.55 }}>
          还没有好友。添加后可查看打卡与分享动态。
        </p>
      ) : (
        <div className="friends-letter-list">
          {groups.map((g) => (
            <section key={g.letter} className="friends-letter-group">
              <div className="friends-letter-head">{g.letter}</div>
              {g.items.map((f) => {
                const name = friendRemarkOrName(f.user_id, friendDisplayName(f));
                return (
                  <Link
                    key={f.user_id}
                    href={`/discover/friends/${f.user_id}`}
                    className="friends-list-row"
                  >
                    <FriendAvatar friend={f} size={42} />
                    <div className="friends-list-row-text">
                      <strong>{name}</strong>
                      {f.handle && (
                        <span className="muted friends-list-row-sub">@{f.handle}</span>
                      )}
                    </div>
                    <span className="friends-list-chevron muted" aria-hidden>›</span>
                  </Link>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
