'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, effectiveId, ensureAccountReady, type Group } from '@/lib/api';
import ErrorBanner, { errorMessage } from '@/components/ErrorBanner';
import Avatar, { defaultAvatarId } from '@/components/Avatar';
import { markRouteNavigation } from '@/lib/pwa_tab_nav';
import { useOnline, isBrowserOnline } from '@/lib/use_online';

function groupRoleLabel(role: string): string {
  if (role === 'owner') return '群主';
  if (role === 'admin') return '管理员';
  return '成员';
}

export default function DiscoverContactsGroupsPane() {
  const router = useRouter();
  const online = useOnline();
  const [uid, setUid] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

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

  const reload = useCallback(async () => {
    if (!isBrowserOnline()) {
      setErr(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const gRes = await api.myGroups();
      setGroups(Array.isArray(gRes.groups) ? gRes.groups : []);
      setErr(null);
    } catch (e) {
      if (isBrowserOnline()) setErr(errorMessage(e, '加载失败，请稍后再试'));
      else setErr(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void ensureAccountReady().then(() => setUid(effectiveId() || null));
  }, []);

  useEffect(() => {
    if (!uid) return;
    if (!online) {
      setErr(null);
      setLoading(false);
      return;
    }
    void reload();
  }, [uid, online, reload]);

  const go = (href: string) => {
    markRouteNavigation();
    router.push(href);
  };

  if (!uid) {
    return (
      <div className="discover-friends-pane">
        {!online ? (
          <p className="muted offline-page-hint">当前离线，群列表需联网后刷新。</p>
        ) : (
          <p className="muted" style={{ padding: '12px 0' }}>正在准备账号…</p>
        )}
      </div>
    );
  }

  return (
    <div className="discover-friends-pane">
      {!online ? (
        <p className="muted offline-page-hint">当前离线，群列表需联网后刷新。</p>
      ) : null}
      {online && err ? <ErrorBanner message={err} onRetry={() => void reload()} /> : null}

      <div className="discover-contacts-section-head" style={{ marginBottom: 12 }}>
        <div className="discover-im-search" style={{ flex: 1, margin: 0 }}>
          <input
            className="search-input"
            value={q}
            placeholder="搜索群名或邀请码…"
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="discover-contacts-section-actions">
          <button type="button" className="text-link" onClick={() => go('/group/create')}>
            新建
          </button>
          <button type="button" className="text-link" onClick={() => go('/discover/join')}>
            加入
          </button>
        </div>
      </div>

      {loading && groups.length === 0 ? (
        <p className="muted" style={{ padding: '8px 0' }}>加载中…</p>
      ) : null}

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
    </div>
  );
}
