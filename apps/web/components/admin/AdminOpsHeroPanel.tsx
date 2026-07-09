'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  deleteAdminHeroCampaign,
  fetchAdminHeroCampaigns,
  saveAdminHeroCampaign,
  uploadAdminHeroImage,
  adminHeroPreviewHint,
} from '@/lib/admin_hero_b';
import type { HeroBCampaignAdmin } from '@/lib/hero_b_campaign';
import { DEFAULT_LINK_CATALOG, resolveHeroBHref, type HeroBLink } from '@/lib/hero_b_link';
import { contentAssetUrl } from '@/lib/api';

const EMPTY_FORM: Partial<HeroBCampaignAdmin> & { link: HeroBLink } = {
  id: '',
  name: '',
  enabled: true,
  status: 'draft',
  priority: 50,
  startAt: '',
  endAt: '',
  imageUrl: '',
  imageUrlDark: '',
  imageVersion: 1,
  alt: '',
  badge: '',
  href: '/',
  audience: 'all',
  link: { kind: 'challenge', params: {} },
};

function toLocalInputValue(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(value: string): string {
  if (!value) return new Date().toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export default function AdminOpsHeroPanel() {
  const [items, setItems] = useState<HeroBCampaignAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<HeroBCampaignAdmin> & { link: HeroBLink } | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hrefPreview, setHrefPreview] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setItems(await fetchAdminHeroCampaigns());
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!editing?.link) {
      setHrefPreview('');
      return;
    }
    try {
      setHrefPreview(resolveHeroBHref(editing.link));
    } catch {
      setHrefPreview('');
    }
  }, [editing?.link]);

  const catalog = DEFAULT_LINK_CATALOG;

  const startEdit = (item?: HeroBCampaignAdmin) => {
    if (item) {
      setIsNew(false);
      setEditing({
        ...item,
        startAt: toLocalInputValue(item.startAt),
        endAt: toLocalInputValue(item.endAt),
      });
    } else {
      const now = new Date();
      const later = new Date(now.getTime() + 7 * 86400000);
      setIsNew(true);
      setEditing({
        ...EMPTY_FORM,
        startAt: toLocalInputValue(now.toISOString()),
        endAt: toLocalInputValue(later.toISOString()),
      });
    }
  };

  const updateLink = (patch: Partial<HeroBLink> & { kind?: string }) => {
    if (!editing) return;
    const link: HeroBLink = {
      kind: patch.kind ?? editing.link.kind,
      params: { ...(editing.link.params ?? {}), ...(patch.params ?? {}) },
    };
    if (patch.kind) link.params = {};
    setEditing({ ...editing, link });
  };

  const save = async () => {
    if (!editing?.id || !editing.name) return;
    setBusy(true);
    setErr(null);
    try {
      const body = {
        ...editing,
        id: editing.id.trim(),
        name: editing.name.trim(),
        startAt: fromLocalInputValue(String(editing.startAt)),
        endAt: fromLocalInputValue(String(editing.endAt)),
        href: resolveHeroBHref(editing.link),
      } as HeroBCampaignAdmin;
      await saveAdminHeroCampaign(body, isNew);
      setEditing(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const onUpload = async (file: File | null) => {
    if (!file || !editing) return;
    setBusy(true);
    try {
      const imageUrl = await uploadAdminHeroImage(file, editing.id || undefined);
      setEditing({
        ...editing,
        imageUrl,
        imageVersion: (editing.imageVersion ?? 1) + 1,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : '上传失败');
    } finally {
      setBusy(false);
    }
  };

  const linkFields = useMemo(() => {
    if (!editing) return null;
    const kind = editing.link.kind;
    if (kind === 'tab') {
      return (
        <select
          className="search-input"
          value={String(editing.link.params?.tab ?? 'home')}
          onChange={(e) => updateLink({ params: { tab: e.target.value } })}
        >
          {catalog.tabs.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      );
    }
    if (kind === 'reader') {
      return (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="search-input"
            placeholder="书卷 ID，如 MAT"
            value={String(editing.link.params?.book ?? 'MAT')}
            onChange={(e) => updateLink({ params: { book: e.target.value } })}
          />
          <input
            className="search-input"
            type="number"
            min={1}
            placeholder="章"
            value={String(editing.link.params?.chapter ?? 1)}
            onChange={(e) => updateLink({ params: { chapter: e.target.value } })}
          />
        </div>
      );
    }
    if (kind === 'map') {
      return (
        <select
          className="search-input"
          value={String(editing.link.params?.tourId ?? catalog.maps[0]?.id)}
          onChange={(e) => updateLink({ params: { tourId: e.target.value } })}
        >
          {catalog.maps.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      );
    }
    if (kind === 'timeline') {
      return (
        <select
          className="search-input"
          value={String(editing.link.params?.tourId ?? catalog.timelines[0]?.id)}
          onChange={(e) => updateLink({ params: { tourId: e.target.value } })}
        >
          {catalog.timelines.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      );
    }
    if (kind === 'diagram') {
      return (
        <select
          className="search-input"
          value={String(editing.link.params?.diagramId ?? catalog.diagrams[0]?.id)}
          onChange={(e) => updateLink({ params: { diagramId: e.target.value } })}
        >
          {catalog.diagrams.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      );
    }
    if (kind === 'graph') {
      return (
        <select
          className="search-input"
          value={String(editing.link.params?.topicId ?? catalog.graphs[0]?.id)}
          onChange={(e) => updateLink({ params: { topicId: e.target.value } })}
        >
          {catalog.graphs.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      );
    }
    if (kind === 'discover') {
      return (
        <select
          className="search-input"
          value={String(editing.link.params?.view ?? 'home')}
          onChange={(e) => updateLink({ params: { view: e.target.value } })}
        >
          {catalog.discoverViews.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      );
    }
    if (kind === 'path') {
      return (
        <input
          className="search-input"
          placeholder="/challenge"
          value={String(editing.link.params?.path ?? '/')}
          onChange={(e) => updateLink({ params: { path: e.target.value } })}
        />
      );
    }
    return <p className="muted" style={{ fontSize: 13, margin: 0 }}>无需额外参数</p>;
  }, [catalog, editing]);

  if (loading) {
    return <p className="muted">加载活动列表…</p>;
  }

  return (
    <div className="admin-ops-hero">
      {err ? <p className="admin-rag-error-text">{err}</p> : null}

      {!editing ? (
        <>
          <div className="admin-ops-hero-toolbar">
            <button type="button" className="btn" onClick={() => startEdit()}>新建活动</button>
            <button type="button" className="text-link" onClick={() => void load()}>刷新</button>
          </div>
          {items.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>暂无活动。无活动时首页仅展示每日经文。</p>
          ) : (
            <div className="admin-ops-hero-list">
              {items.map((item) => (
                <div key={item.id} className="card card-2 admin-ops-hero-item">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={contentAssetUrl(item.imageUrl)}
                      alt=""
                      className="admin-ops-hero-thumb"
                    />
                  ) : null}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong>{item.name}</strong>
                    <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                      {item.status} · P{item.priority} · {item.enabled ? '启用' : '停用'}
                    </p>
                    <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>{item.href}</p>
                  </div>
                  <div className="admin-ops-hero-actions">
                    <button type="button" className="text-link" onClick={() => startEdit(item)}>编辑</button>
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => {
                        void navigator.clipboard.writeText(adminHeroPreviewHint(item.id));
                      }}
                    >
                      预览 API
                    </button>
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => {
                        if (!confirm(`删除活动「${item.name}」？`)) return;
                        void deleteAdminHeroCampaign(item.id).then(load);
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="admin-ops-hero-form">
          <p className="settings-title">{isNew ? '新建活动' : '编辑活动'}</p>
          <input
            className="search-input"
            style={{ marginBottom: 8 }}
            placeholder="活动 ID（英文 slug）"
            disabled={!isNew}
            value={editing.id}
            onChange={(e) => setEditing({ ...editing, id: e.target.value })}
          />
          <input
            className="search-input"
            style={{ marginBottom: 8 }}
            placeholder="活动名称"
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
          />
          <label className="muted" style={{ fontSize: 12 }}>主图上传</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ marginBottom: 8 }}
            onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
          />
          {editing.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={contentAssetUrl(editing.imageUrl)}
              alt="预览"
              className="admin-ops-hero-preview"
            />
          ) : null}
          <input
            className="search-input"
            style={{ marginBottom: 8 }}
            placeholder="alt 无障碍描述"
            value={editing.alt ?? ''}
            onChange={(e) => setEditing({ ...editing, alt: e.target.value })}
          />
          <input
            className="search-input"
            style={{ marginBottom: 8 }}
            placeholder="角标（可选，≤6 字）"
            value={editing.badge ?? ''}
            onChange={(e) => setEditing({ ...editing, badge: e.target.value })}
          />
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              className="search-input"
              type="datetime-local"
              value={String(editing.startAt)}
              onChange={(e) => setEditing({ ...editing, startAt: e.target.value })}
            />
            <input
              className="search-input"
              type="datetime-local"
              value={String(editing.endAt)}
              onChange={(e) => setEditing({ ...editing, endAt: e.target.value })}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              className="search-input"
              type="number"
              placeholder="优先级"
              value={editing.priority ?? 0}
              onChange={(e) => setEditing({ ...editing, priority: Number(e.target.value) })}
            />
            <select
              className="search-input"
              value={editing.status}
              onChange={(e) => setEditing({ ...editing, status: e.target.value as 'draft' | 'published' })}
            >
              <option value="draft">草稿</option>
              <option value="published">已发布</option>
            </select>
            <select
              className="search-input"
              value={editing.audience}
              onChange={(e) => setEditing({ ...editing, audience: e.target.value as 'all' | 'admin_preview' })}
            >
              <option value="all">全员</option>
              <option value="admin_preview">仅管理员预览</option>
            </select>
          </div>
          <label className="muted" style={{ fontSize: 12 }}>链接类型</label>
          <select
            className="search-input"
            style={{ marginBottom: 8 }}
            value={editing.link.kind}
            onChange={(e) => updateLink({ kind: e.target.value })}
          >
            <option value="challenge">闯关</option>
            <option value="tab">底栏 Tab</option>
            <option value="reader">读经</option>
            <option value="map">地图故事</option>
            <option value="timeline">时间线</option>
            <option value="diagram">图鉴</option>
            <option value="graph">关系图谱</option>
            <option value="discover">发现</option>
            <option value="plans">计划</option>
            <option value="assistant">小爱</option>
            <option value="path">自定义路径</option>
          </select>
          {linkFields}
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            解析结果：<code>{hrefPreview || '—'}</code>
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={editing.enabled !== false}
              onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })}
            />
            启用
          </label>
          <div className="admin-ops-hero-form-actions">
            <button type="button" className="btn" disabled={busy} onClick={() => void save()}>
              {busy ? '保存中…' : '保存'}
            </button>
            <button type="button" className="text-link" onClick={() => setEditing(null)}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}
