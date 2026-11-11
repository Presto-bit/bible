'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  api,
  effectiveId,
  ensureAccountReady,
  type FriendRequestItem,
} from '@/lib/api';
import ErrorBanner, { errorMessage } from '@/components/ErrorBanner';
import { friendRequestLabel } from '@/lib/friend_label';
import { useOnline, isBrowserOnline } from '@/lib/use_online';

export default function DiscoverContactsRequestsPane() {
  const online = useOnline();
  const [uid, setUid] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<FriendRequestItem[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequestItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!isBrowserOnline()) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const r = await api.friendRequests();
      setIncoming(r.incoming ?? []);
      setOutgoing(r.outgoing ?? []);
      setErr(null);
    } catch (e) {
      setErr(errorMessage(e, '加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void ensureAccountReady().then(() => setUid(effectiveId() || null));
  }, []);

  useEffect(() => {
    if (!uid) return;
    void reload();
  }, [uid, online, reload]);

  const accept = (id: string) => {
    void api.acceptFriendRequest(id).then(() => reload()).catch((e) => setErr(errorMessage(e, '操作失败')));
  };

  const decline = (id: string) => {
    void api.declineFriendRequest(id).then(() => reload()).catch((e) => setErr(errorMessage(e, '操作失败')));
  };

  if (!uid) {
    return <p className="muted" style={{ padding: '12px 0' }}>正在准备账号…</p>;
  }

  const empty = !loading && incoming.length === 0 && outgoing.length === 0;

  return (
    <div className="discover-friends-pane">
      {!online ? (
        <p className="muted offline-page-hint">当前离线，需联网后刷新。</p>
      ) : null}
      {err ? <ErrorBanner message={err} onRetry={() => void reload()} /> : null}

      {loading && empty ? (
        <p className="muted" style={{ padding: '8px 0' }}>加载中…</p>
      ) : null}

      {empty ? (
        <p className="muted discover-empty-inline">暂无好友申请</p>
      ) : null}

      {incoming.length > 0 ? (
        <section style={{ marginBottom: 16 }}>
          <p className="section-label">待你确认</p>
          <ul className="discover-conv-list is-ruled">
            {incoming.map((r) => (
              <li key={r.id} className="discover-conv-li">
                <div className="discover-conv-row discover-conv-row-static">
                  <span className="discover-conv-avatar scope-inbox_friends" aria-hidden>友</span>
                  <div className="discover-conv-main">
                    <div className="discover-conv-title-row">
                      <div className="discover-conv-title-left">
                        <strong>{friendRequestLabel(r)}</strong>
                      </div>
                    </div>
                    <div className="discover-conv-sub-row">
                      <p className="muted discover-conv-sub">
                        {r.message
                          ? `附言：${r.message}`
                          : r.user_code
                            ? `ID ${r.user_code}`
                            : r.handle
                              ? `@${r.handle}`
                              : '申请加你为好友'}
                      </p>
                    </div>
                  </div>
                  <div className="discover-conv-actions">
                    <button
                      type="button"
                      className="btn discover-conv-action-btn"
                      onClick={() => accept(r.id)}
                    >
                      同意
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost discover-conv-action-btn"
                      onClick={() => decline(r.id)}
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

      {outgoing.length > 0 ? (
        <section>
          <p className="section-label">等待对方</p>
          <ul className="discover-conv-list is-ruled">
            {outgoing.map((r) => (
              <li key={r.id} className="discover-conv-li">
                <div className="discover-conv-row discover-conv-row-static">
                  <span className="discover-conv-avatar scope-inbox_friends" aria-hidden>友</span>
                  <div className="discover-conv-main">
                    <div className="discover-conv-title-row">
                      <div className="discover-conv-title-left">
                        <strong>{friendRequestLabel(r)}</strong>
                      </div>
                    </div>
                    <div className="discover-conv-sub-row">
                      <p className="muted discover-conv-sub">
                        {r.message ? `附言：${r.message}` : '已发送申请，等待对方同意'}
                      </p>
                    </div>
                  </div>
                  <span className="muted discover-conv-pending-label">待同意</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
