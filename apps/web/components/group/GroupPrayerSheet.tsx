'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

export type GroupPrayerItem = {
  id: string;
  group_id: string;
  author_id: string;
  title: string;
  body: string;
  privacy: 'group' | 'staff';
  status: 'open' | 'answered' | 'archived';
  tag: string;
  answered_note: string;
  answered_at?: string | null;
  created_at?: string | null;
  claim_count: number;
  claimed_by_me: boolean;
};

type Tab = 'open' | 'mine' | 'answered';

type Props = {
  open: boolean;
  gid: string;
  isStaff?: boolean;
  myUserId?: string | null;
  onClose: () => void;
};

export function GroupPrayerSheet({ open, gid, isStaff, myUserId, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('open');
  const [items, setItems] = useState<GroupPrayerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [privacy, setPrivacy] = useState<'group' | 'staff'>('group');
  const [tag, setTag] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await api.listGroupPrayers(gid, tab);
      setItems(r.items || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [gid, tab]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  if (!open) return null;

  const submit = async () => {
    const t = title.trim();
    if (!t) {
      setErr('请填写代祷标题');
      return;
    }
    setBusyId('create');
    setErr(null);
    try {
      await api.createGroupPrayer(gid, {
        title: t,
        body: body.trim() || undefined,
        privacy,
        tag: tag.trim() || undefined,
      });
      setTitle('');
      setBody('');
      setPrivacy('group');
      setTag('');
      setComposing(false);
      setTab('open');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const toggleClaim = async (item: GroupPrayerItem) => {
    setBusyId(item.id);
    setErr(null);
    try {
      if (item.claimed_by_me) await api.unclaimGroupPrayer(gid, item.id);
      else await api.claimGroupPrayer(gid, item.id);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const markAnswered = async (item: GroupPrayerItem) => {
    setBusyId(item.id);
    setErr(null);
    try {
      await api.answerGroupPrayer(gid, item.id, {});
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet card group-prayer-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="群代祷"
      >
        <div className="half-sheet-grab" aria-hidden />
        <div className="section-row group-settings-sheet-head">
          <button type="button" className="text-link" onClick={onClose}>
            关闭
          </button>
          <strong>群代祷</strong>
          <button
            type="button"
            className="text-link"
            onClick={() => setComposing((v) => !v)}
          >
            {composing ? '取消' : '新建'}
          </button>
        </div>

        <div className="group-prayer-tabs" role="tablist">
          {(
            [
              ['open', '进行中'],
              ['mine', '我认领的'],
              ['answered', '已应允'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`group-prayer-tab${tab === id ? ' active' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {composing ? (
          <div className="group-prayer-compose">
            <input
              className="input"
              placeholder="代祷标题（必填）"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              className="input"
              placeholder="详情（选填）"
              rows={3}
              value={body}
              maxLength={2000}
              onChange={(e) => setBody(e.target.value)}
            />
            <div className="group-prayer-compose-row">
              <label>
                <input
                  type="radio"
                  name="privacy"
                  checked={privacy === 'group'}
                  onChange={() => setPrivacy('group')}
                />{' '}
                全群可见
              </label>
              <label>
                <input
                  type="radio"
                  name="privacy"
                  checked={privacy === 'staff'}
                  onChange={() => setPrivacy('staff')}
                />{' '}
                仅管理员
              </label>
            </div>
            <input
              className="input"
              placeholder="标签（如：健康 / 家庭 / 服事）"
              value={tag}
              maxLength={32}
              onChange={(e) => setTag(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-block"
              disabled={busyId === 'create'}
              onClick={submit}
            >
              发布代祷
            </button>
          </div>
        ) : null}

        {err ? (
          <p className="muted" role="alert" style={{ margin: '8px 0' }}>
            {err}
          </p>
        ) : null}

        {loading ? (
          <p className="muted">加载中…</p>
        ) : items.length === 0 ? (
          <p className="muted group-prayer-empty">
            {tab === 'open'
              ? '暂无进行中的代祷，点右上角新建。'
              : tab === 'mine'
                ? '你还没有认领代祷。'
                : '暂无已应允记录。'}
          </p>
        ) : (
          <ul className="group-prayer-list">
            {items.map((item) => {
              const canAnswer =
                item.status === 'open' &&
                (isStaff || (myUserId && item.author_id === myUserId));
              return (
                <li key={item.id} className="group-prayer-item">
                  <div className="group-prayer-item-head">
                    <strong>{item.title}</strong>
                    {item.tag ? <span className="pill">{item.tag}</span> : null}
                    {item.privacy === 'staff' ? (
                      <span className="muted" style={{ fontSize: 11 }}>
                        私密
                      </span>
                    ) : null}
                  </div>
                  {item.body ? <p className="group-prayer-body">{item.body}</p> : null}
                  {item.status === 'answered' && item.answered_note ? (
                    <p className="muted group-prayer-answered">应允：{item.answered_note}</p>
                  ) : null}
                  <div className="group-prayer-item-actions">
                    {item.status === 'open' ? (
                      <button
                        type="button"
                        className={`text-link${item.claimed_by_me ? ' is-active' : ''}`}
                        disabled={busyId === item.id}
                        onClick={() => toggleClaim(item)}
                      >
                        {item.claimed_by_me ? '已认领' : '我在祷告'}
                        {item.claim_count > 0 ? ` · ${item.claim_count}` : ''}
                      </button>
                    ) : (
                      <span className="muted" style={{ fontSize: 12 }}>
                        已应允
                      </span>
                    )}
                    {canAnswer ? (
                      <button
                        type="button"
                        className="text-link"
                        disabled={busyId === item.id}
                        onClick={() => markAnswered(item)}
                      >
                        标记已应允
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
