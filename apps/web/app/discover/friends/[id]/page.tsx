'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import PageBackBar from '@/components/PageBackBar';
import ErrorBanner, { errorMessage } from '@/components/ErrorBanner';
import { FriendAvatar } from '@/components/discover/FriendAvatar';
import { GroupInviteSheet } from '@/components/group/GroupInviteSheet';
import {
  api,
  effectiveId,
  ensureAccountReady,
  type Friend,
  type Group,
} from '@/lib/api';
import { friendDisplayName } from '@/lib/friend_label';
import { friendRemarkOrName, getFriendRemark, setFriendRemark } from '@/lib/friend_remarks';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { useConfirm } from '@/components/ui/ConfirmProvider';

export default function FriendProfilePage() {
  const params = useParams();
  const router = useRouter();
  const confirm = useConfirm();
  const friendId = String(params.id ?? '');
  useEdgeSwipeBack({ href: '/discover?tab=friends' });

  const [uid, setUid] = useState<string | null>(null);
  const [friend, setFriend] = useState<Friend | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [remark, setRemark] = useState('');
  const [editingRemark, setEditingRemark] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteGroup, setInviteGroup] = useState<Group | null>(null);
  const [dmBusy, setDmBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [fRes, gRes] = await Promise.all([api.friends(), api.myGroups()]);
      const found = fRes.friends.find((f) => f.user_id === friendId) ?? null;
      setFriend(found);
      setGroups(gRes.groups);
      if (found) setRemark(getFriendRemark(friendId));
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

  const displayName = friend
    ? friendRemarkOrName(friend.user_id, friendDisplayName(friend))
    : '好友';

  const onDelete = async () => {
    const ok = await confirm({
      title: '删除好友',
      message: `确定删除「${displayName}」？`,
      confirmLabel: '删除',
    });
    if (!ok) return;
    try {
      await api.removeFriend(friendId);
      router.push('/discover');
    } catch (e) {
      setErr(errorMessage(e, '删除失败'));
    }
  };

  const openInvite = () => {
    const g = ownedGroups[0];
    if (!g) {
      router.push('/group/create');
      return;
    }
    setInviteGroup(g);
    setInviteOpen(true);
  };

  const openDm = async () => {
    setDmBusy(true);
    setErr(null);
    try {
      const dm = await api.openDm(friendId);
      router.push(`/discover/dm/${dm.thread_id}`);
    } catch (e) {
      setErr(errorMessage(e, '打开私信失败'));
    } finally {
      setDmBusy(false);
    }
  };

  if (!uid) {
    return (
      <main className="container">
        <p className="muted">正在准备账号…</p>
      </main>
    );
  }

  return (
    <main className="container friend-profile-page">
      <header className="page-head">
        <PageBackBar href="/discover?tab=friends" label="好友" />
        <h2 className="page-head-title">{displayName}</h2>
      </header>

      {err && <ErrorBanner message={err} />}

      {friend && (
        <div className="card friend-profile-card">
          <div className="friend-profile-card-main">
            <FriendAvatar friend={friend} size={52} />
            <div className="friend-profile-card-text">
              <strong>{displayName}</strong>
              {friend.handle && (
                <p className="muted friend-profile-handle">@{friend.handle}</p>
              )}
            </div>
          </div>
          <div className="friend-profile-card-actions">
            <button
              type="button"
              className="friend-action-btn friend-action-accent"
              disabled={dmBusy}
              onClick={() => void openDm()}
            >
              {dmBusy ? '打开中…' : '发私信'}
            </button>
            <button type="button" className="friend-action-btn" onClick={openInvite}>
              邀请到群
            </button>
            <button
              type="button"
              className="friend-action-btn"
              onClick={() => setEditingRemark((v) => !v)}
            >
              {editingRemark ? '收起备注' : '修改备注'}
            </button>
            <button type="button" className="friend-action-btn" onClick={() => void onDelete()}>
              删除
            </button>
          </div>
          {editingRemark ? (
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <input
                className="search-input"
                style={{ flex: 1 }}
                value={remark}
                placeholder="备注名"
                onChange={(e) => setRemark(e.target.value)}
              />
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setFriendRemark(friendId, remark);
                  setEditingRemark(false);
                }}
              >
                保存
              </button>
            </div>
          ) : null}
          <p className="muted" style={{ marginTop: 14, fontSize: 12, lineHeight: 1.5 }}>
            好友关系用于私信与邀请入群。
          </p>
        </div>
      )}

      {inviteOpen && inviteGroup && friend && (
        <GroupInviteSheet
          gid={inviteGroup.id}
          groupName={inviteGroup.name}
          joinCode={inviteGroup.join_code}
          memberUserIds={[]}
          preselectIds={[friend.user_id]}
          onClose={() => setInviteOpen(false)}
          onInvited={() => {
            setInviteOpen(false);
            void reload();
          }}
        />
      )}
    </main>
  );
}
