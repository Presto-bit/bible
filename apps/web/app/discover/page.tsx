'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  api,
  currentUserId,
  guestId,
  type Friend,
  type Group,
} from '@/lib/api';

type Activity = {
  id: string;
  who: string;
  what: string;
  excerpt?: string;
  likes: number;
  ref?: string;
};

async function loadFriendActivity(groups: Group[]): Promise<Activity[]> {
  const items: Activity[] = [];
  for (const g of groups.slice(0, 5)) {
    try {
      const { messages } = await api.groupFeed(g.id);
      for (const m of messages) {
        if (m.mine || m.kind !== 'checkin') continue;
        const likes = Object.values(m.reactions).reduce(
          (n, users) => n + users.length,
          0,
        );
        items.push({
          id: m.id,
          who: m.author,
          what: m.ref || '打卡',
          excerpt: m.body ?? undefined,
          likes,
          ref: m.ref ?? undefined,
        });
      }
    } catch {
      // ignore single group failure
    }
  }
  return items.slice(0, 5);
}

export default function DiscoverPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [shares, setShares] = useState<Activity[]>([]);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [g, f] = await Promise.all([api.myGroups(), api.friends()]);
      setGroups(g.groups);
      setFriends(f.friends);
      setShares(await loadFriendActivity(g.groups));
      setErr(null);
    } catch (e) {
      setErr(String(e));
    }
  }, []);

  useEffect(() => {
    // 游客身份即可浏览发现（与 App / canvas 一致）；登录仅影响服务端身份。
    const id = currentUserId() || guestId();
    setUid(id);
    if (id) reload();
  }, [reload]);

  const createGroup = async () => {
    const name = prompt('共读群名称');
    if (!name) return;
    try {
      await api.createGroup(name);
      reload();
    } catch (e) {
      alert(`建群失败：${e}`);
    }
  };
  const joinGroup = async () => {
    const code = prompt('输入邀请码');
    if (!code) return;
    try {
      await api.joinGroup(code);
      reload();
    } catch (e) {
      alert(`加入失败：${e}`);
    }
  };
  const addFriend = async () => {
    const handle = prompt('输入好友账号（handle）');
    if (!handle) return;
    try {
      await api.addFriend(handle);
      reload();
    } catch (e) {
      alert(`添加失败：${e}`);
    }
  };

  const toggleLike = async (id: string) => {
    setLiked((prev) => ({ ...prev, [id]: !prev[id] }));
    try {
      await api.react(id, liked[id] ? '👍' : '❤️');
    } catch {
      // ignore
    }
  };

  if (!uid) {
    return (
      <main className="container">
        <div className="card card-2">
          <p>登录后即可加入共读群、添加好友、一起打卡。</p>
          <Link className="btn" href="/profile">
            去登录
          </Link>
        </div>
      </main>
    );
  }

  const todayText =
    groups.length === 0
      ? '还没有共读群 · 受邀或创建一个，和大家一起开始'
      : `${groups.length} 个共读群 · 今天 ${shares.length} 条好友动态`;

  return (
    <main className="container">
      <div className="card card-tint card-2 card-accent today-card">
        <div className="today-title">今日</div>
        <p className="today-sub">{todayText}</p>
      </div>

      {groups.length === 0 ? (
        <div className="card card-tint card-2 card-accent" style={{ marginTop: 14 }}>
          <strong>共读群 · 一起读</strong>
          <p className="muted" style={{ marginTop: 6, lineHeight: 1.5 }}>
            受好友邀请，或自己创建一个群，和大家按计划一起读、彼此打卡。
          </p>
          <button className="btn" style={{ marginTop: 12 }} onClick={createGroup}>
            创建共读群
          </button>
          <button
            className="font-pill"
            style={{ marginTop: 8, marginLeft: 8 }}
            onClick={joinGroup}
          >
            邀请码加入
          </button>
        </div>
      ) : (
        <>
          <div className="section-row" style={{ marginTop: 14 }}>
            <span>我的共读</span>
            <Link href="/discover" className="muted">
              查看全部 ›
            </Link>
          </div>
          <div className="rail" style={{ marginTop: 8 }}>
            {groups.map((g) => (
              <Link
                key={g.id}
                href={`/discover/group/${g.id}`}
                className="rail-card card card-2 group-card"
              >
                <div className="group-card-head">
                  <strong>{g.name}</strong>
                  {g.role === 'owner' && (
                    <span className="rail-cta">群主</span>
                  )}
                </div>
                <p className="muted">{g.members} 位成员</p>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: '42%' }} />
                </div>
                <div className="group-card-foot">
                  <span className="muted">进入群聊 ›</span>
                  <span className="rail-cta">去打卡 ›</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="section-row" style={{ marginTop: 18 }}>
        <span>好友动态</span>
        {friends.length > 0 && shares.length > 0 && (
          <span className="muted">查看全部 ›</span>
        )}
      </div>

      {friends.length === 0 ? (
        <div className="card" style={{ marginTop: 8 }}>
          <strong>添加好友后可见动态</strong>
          <p className="muted" style={{ marginTop: 6, lineHeight: 1.5 }}>
            好友的经文打卡与笔记会出现在这里。
          </p>
          <button className="font-pill" onClick={addFriend}>
            加好友
          </button>
        </div>
      ) : shares.length === 0 ? (
        <p className="muted" style={{ marginTop: 8 }}>
          暂无好友动态，去群里打卡或等好友分享吧
        </p>
      ) : (
        shares.map((s) => (
          <div key={s.id} className="card share-card">
            <strong>{s.who}</strong>
            <p className="muted">{s.what}</p>
            {s.excerpt && <p style={{ marginTop: 6, lineHeight: 1.5 }}>{s.excerpt}</p>}
            <button
              type="button"
              className="like-btn"
              onClick={() => toggleLike(s.id)}
            >
              {liked[s.id] ? '❤️' : '🤍'} {s.likes + (liked[s.id] ? 1 : 0)}
            </button>
            <div className="share-actions">
              <Link
                className="font-pill"
                href={`/assistant?ref=${encodeURIComponent(s.ref || '')}`}
              >
                问小爱
              </Link>
              <Link className="font-pill" href="/reader">
                我也在读
              </Link>
            </div>
          </div>
        ))
      )}
    </main>
  );
}
