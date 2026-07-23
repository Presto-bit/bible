'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, type OpsCampaign } from '@/lib/api';
import { getSessionToken } from '@/lib/session';
import {
  campaignShareUrl,
  campaignStatusLabel,
  campaignStatusTone,
  copyText,
  formatRelativeTime,
} from '@/lib/campaign_ops';

export default function CampaignsListPage() {
  const router = useRouter();
  const [items, setItems] = useState<OpsCampaign[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuId, setMenuId] = useState<string | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      if (!getSessionToken()) {
        setErr('请先登录后再管理活动');
        setItems([]);
        return;
      }
      const res = await api.myCampaigns(statusFilter);
      setItems(res.campaigns || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const close = () => setMenuId(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.tag || '').toLowerCase().includes(q) ||
        (c.subtitle || '').toLowerCase().includes(q),
    );
  }, [items, query]);

  const onCopy = async (id: string) => {
    try {
      const { campaign } = await api.copyCampaign(id);
      router.push(`/campaigns/${campaign.id}/edit`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '复制失败');
    }
  };

  const onDelete = async (id: string) => {
    if (!window.confirm('确定删除此活动？')) return;
    try {
      await api.deleteCampaign(id);
      flash('已删除');
      void load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '删除失败');
    }
  };

  const onCopyLink = async (id: string) => {
    const ok = await copyText(campaignShareUrl(id));
    flash(ok ? '链接已复制' : '复制失败');
  };

  return (
    <main className="container ops-page">
      <div className="ops-page-head">
        <div>
          <h1 className="ops-page-title">活动运营</h1>
          <p className="ops-page-sub">向你管理的群发布活动，成员在首页「今日推荐」看到</p>
        </div>
        <Link href="/campaigns/new" className="btn btn-primary">
          新建
        </Link>
      </div>

      {err ? <p className="ops-banner ops-banner-warn" style={{ color: 'var(--danger, #b00)' }}>{err}</p> : null}

      <div className="ops-chip-row" role="tablist" aria-label="按状态筛选">
        {(
          [
            ['all', '全部'],
            ['published', '已发布'],
            ['draft', '草稿'],
            ['ended', '已结束'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={statusFilter === k}
            className={`ops-chip${statusFilter === k ? ' is-on' : ''}`}
            onClick={() => setStatusFilter(k)}
          >
            {label}
          </button>
        ))}
      </div>

      <input
        className="input ops-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜索活动名称…"
        aria-label="搜索活动"
      />

      {loading ? <p className="muted" style={{ marginTop: 16 }}>加载中…</p> : null}

      {!loading && filtered.length === 0 && !err ? (
        <div className="card ops-empty">
          <p>{query ? '没有匹配的活动' : '还没有活动'}</p>
          <p className="muted" style={{ fontSize: 13, margin: '0 0 14px' }}>
            {query
              ? '试试换个关键词，或切换上方状态筛选。'
              : '选一个模板，选择谁能看见，填好内容后发布。成员会在首页「今日推荐」看到。'}
          </p>
          {!query ? (
            <Link href="/campaigns/new" className="btn btn-primary">
              三步创建活动
            </Link>
          ) : (
            <button type="button" className="btn" onClick={() => setQuery('')}>
              清空搜索
            </button>
          )}
        </div>
      ) : null}

      <div className="ops-list">
        {filtered.map((c) => {
          const tone = campaignStatusTone(c.status);
          return (
            <article key={c.id} className="card ops-list-card">
              <div>
                <div className="ops-list-meta">
                  <span className="pill">{c.tag || '活动'}</span>
                  <span className={`ops-status ops-status-${tone}`}>
                    {campaignStatusLabel(c.status)}
                  </span>
                  {c.railEnabled ? (
                    <span className="muted" style={{ fontSize: 12 }}>
                      推荐第 {c.railSlot} 位
                    </span>
                  ) : null}
                  {c.updatedAt ? (
                    <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>
                      {formatRelativeTime(c.updatedAt)}
                    </span>
                  ) : null}
                </div>
                <Link href={`/campaigns/${c.id}/edit`} className="ops-list-name" style={{ color: 'inherit', textDecoration: 'none' }}>
                  {c.name}
                </Link>
                <span className="ops-list-stats">
                  {c.audienceMode === 'all'
                    ? '全站'
                    : c.audienceMode === 'admin_preview'
                      ? '超管预览'
                      : `${c.groupIds.length} 个群`}
                  {' · '}打开 {c.stats?.opens ?? 0}
                  {' · '}已读 {c.stats?.readers ?? 0}
                  {c.stats?.rsvps ? ` · RSVP ${c.stats.rsvps}` : ''}
                  {c.stats?.signups ? ` · 报名 ${c.stats.signups}` : ''}
                </span>
              </div>
              <div className="ops-list-actions">
                <Link href={`/campaigns/${c.id}/edit`} className="btn btn-primary">
                  编辑
                </Link>
                <Link href={`/campaigns/view/${c.id}?preview=1`} className="btn">
                  预览
                </Link>
                <button type="button" className="btn" onClick={() => void onCopyLink(c.id)}>
                  链接
                </button>
                <div className="ops-more">
                  <button
                    type="button"
                    className="btn"
                    aria-expanded={menuId === c.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuId((id) => (id === c.id ? null : c.id));
                    }}
                  >
                    更多
                  </button>
                  {menuId === c.id ? (
                    <div className="ops-more-menu" onClick={(e) => e.stopPropagation()}>
                      <button type="button" onClick={() => void onCopy(c.id)}>
                        复制活动
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await api.extendCampaign(c.id, 7);
                            flash('已延期 7 天');
                            setMenuId(null);
                            void load();
                          } catch (e) {
                            setErr(e instanceof Error ? e.message : '延期失败');
                          }
                        }}
                      >
                        延期 7 天
                      </button>
                      <button
                        type="button"
                        className="is-danger"
                        onClick={() => void onDelete(c.id)}
                      >
                        删除
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {toast ? <div className="ops-toast" role="status">{toast}</div> : null}
    </main>
  );
}
