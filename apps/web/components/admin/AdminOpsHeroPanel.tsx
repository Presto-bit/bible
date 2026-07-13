'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

type ListFilter = 'all' | 'published' | 'draft' | 'disabled';

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

function statusLabel(item: HeroBCampaignAdmin): string {
  if (!item.enabled) return '停用';
  if (item.status === 'draft') return '草稿';
  return '已发布';
}

export default function AdminOpsHeroPanel() {
  const [items, setItems] = useState<HeroBCampaignAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<(Partial<HeroBCampaignAdmin> & { link: HeroBLink }) | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hrefPreview, setHrefPreview] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState<ListFilter>('all');
  const fileRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

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

  const startEdit = useCallback((item?: HeroBCampaignAdmin) => {
    if (item) {
      setIsNew(false);
      setActiveId(item.id);
      setEditing({
        ...item,
        startAt: toLocalInputValue(item.startAt),
        endAt: toLocalInputValue(item.endAt),
      });
    } else {
      const now = new Date();
      const later = new Date(now.getTime() + 7 * 86400000);
      setIsNew(true);
      setActiveId(null);
      setEditing({
        ...EMPTY_FORM,
        startAt: toLocalInputValue(now.toISOString()),
        endAt: toLocalInputValue(later.toISOString()),
      });
    }
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (!id) return;
      const found = itemsRef.current.find((i) => i.id === id);
      if (found) startEdit(found);
    };
    window.addEventListener('admin-ops-open', onOpen);
    return () => window.removeEventListener('admin-ops-open', onOpen);
  }, [startEdit]);

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
      setActiveId(body.id);
      setIsNew(false);
      await load();
      setEditing({
        ...body,
        startAt: toLocalInputValue(body.startAt),
        endAt: toLocalInputValue(body.endAt),
      });
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

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (listFilter === 'all') return true;
      if (listFilter === 'disabled') return !item.enabled;
      if (listFilter === 'draft') return item.status === 'draft';
      return item.enabled && item.status === 'published';
    });
  }, [items, listFilter]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, editing]);

  if (loading) {
    return <p className="muted">加载活动列表…</p>;
  }

  const previewImage = editing?.imageUrl
    ? contentAssetUrl(editing.imageUrl)
    : null;

  return (
    <div className="admin-ops-studio">
      {err ? <p className="admin-rag-error-text">{err}</p> : null}

      <div className="admin-ops-studio-head">
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          列表 · 手机预览 · 属性面板。无活动时首页只展示每日经文。
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button type="button" className="btn" onClick={() => startEdit()}>新建活动</button>
          <button type="button" className="text-link" onClick={() => void load()}>刷新</button>
        </div>
      </div>

      <div className="admin-ops-studio-body">
        <aside className="admin-ops-studio-list">
          <div className="admin-ops-studio-filters">
            {([
              ['all', '全部'],
              ['published', '已发布'],
              ['draft', '草稿'],
              ['disabled', '停用'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={listFilter === id ? 'is-active' : ''}
                onClick={() => setListFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {filtered.length === 0 ? (
            <p className="muted" style={{ fontSize: 13, padding: 8 }}>暂无活动</p>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`admin-ops-studio-card ${activeId === item.id && editing ? 'is-active' : ''}`}
                onClick={() => startEdit(item)}
              >
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={contentAssetUrl(item.imageUrl)} alt="" />
                ) : (
                  <div className="is-empty">无图</div>
                )}
                <div>
                  <strong>{item.name}</strong>
                  <p className="muted">{statusLabel(item)} · P{item.priority}</p>
                </div>
              </button>
            ))
          )}
        </aside>

        <div className="admin-ops-studio-preview">
          <div className="admin-ops-phone">
            <div className="admin-ops-phone-notch" />
            <div className="admin-ops-phone-screen">
              {previewImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewImage} alt="Hero B 预览" />
              ) : (
                <div className="admin-ops-phone-placeholder">
                  <p>Hero B</p>
                  <span className="muted">上传主图后在此预览</span>
                </div>
              )}
              {editing?.badge ? <span className="admin-ops-phone-badge">{editing.badge}</span> : null}
            </div>
            {hrefPreview ? (
              <a className="admin-ops-phone-href muted" href={hrefPreview} target="_blank" rel="noreferrer">
                点击跳转 → {hrefPreview}
              </a>
            ) : (
              <p className="admin-ops-phone-href muted">配置链接后可预览跳转</p>
            )}
          </div>
        </div>

        <section className="admin-ops-studio-props">
          {!editing ? (
            <div className="admin-ops-pc-editor-empty">
              <p className="muted">选择左侧活动，或新建</p>
              <button type="button" className="btn" onClick={() => startEdit()}>新建活动</button>
            </div>
          ) : (
            <>
              <div className="section-row" style={{ marginTop: 0, marginBottom: 12 }}>
                <strong>{isNew ? '新建' : '属性'}</strong>
                <div style={{ display: 'flex', gap: 8 }}>
                  {!isNew && editing.id ? (
                    <>
                      <button
                        type="button"
                        className="text-link"
                        onClick={() => {
                          void navigator.clipboard.writeText(adminHeroPreviewHint(String(editing.id)));
                        }}
                      >
                        预览 API
                      </button>
                      <button
                        type="button"
                        className="text-link"
                        onClick={() => {
                          if (!confirm(`删除活动「${editing.name}」？`)) return;
                          void deleteAdminHeroCampaign(String(editing.id)).then(() => {
                            setEditing(null);
                            setActiveId(null);
                            return load();
                          });
                        }}
                      >
                        删除
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="admin-ops-pc-form-grid admin-ops-studio-form">
                <div className="admin-ops-pc-field">
                  <label>活动 ID</label>
                  <input
                    className="search-input"
                    disabled={!isNew}
                    value={editing.id}
                    onChange={(e) => setEditing({ ...editing, id: e.target.value })}
                  />
                </div>
                <div className="admin-ops-pc-field">
                  <label>名称</label>
                  <input
                    className="search-input"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  />
                </div>
                <div className="admin-ops-pc-field">
                  <label>开始</label>
                  <input
                    className="search-input"
                    type="datetime-local"
                    value={String(editing.startAt)}
                    onChange={(e) => setEditing({ ...editing, startAt: e.target.value })}
                  />
                </div>
                <div className="admin-ops-pc-field">
                  <label>结束</label>
                  <input
                    className="search-input"
                    type="datetime-local"
                    value={String(editing.endAt)}
                    onChange={(e) => setEditing({ ...editing, endAt: e.target.value })}
                  />
                </div>
                <div className="admin-ops-pc-field">
                  <label>优先级</label>
                  <input
                    className="search-input"
                    type="number"
                    value={editing.priority ?? 0}
                    onChange={(e) => setEditing({ ...editing, priority: Number(e.target.value) })}
                  />
                </div>
                <div className="admin-ops-pc-field">
                  <label>状态</label>
                  <select
                    className="search-input"
                    value={editing.status}
                    onChange={(e) => setEditing({ ...editing, status: e.target.value as 'draft' | 'published' })}
                  >
                    <option value="draft">草稿</option>
                    <option value="published">已发布</option>
                  </select>
                </div>
                <div className="admin-ops-pc-field">
                  <label>受众</label>
                  <select
                    className="search-input"
                    value={editing.audience}
                    onChange={(e) => setEditing({ ...editing, audience: e.target.value as 'all' | 'admin_preview' })}
                  >
                    <option value="all">全员</option>
                    <option value="admin_preview">仅管理员预览</option>
                  </select>
                </div>
                <div className="admin-ops-pc-field">
                  <label>角标</label>
                  <input
                    className="search-input"
                    value={editing.badge ?? ''}
                    onChange={(e) => setEditing({ ...editing, badge: e.target.value })}
                  />
                </div>
                <div className="admin-ops-pc-field span-2">
                  <label>alt</label>
                  <input
                    className="search-input"
                    value={editing.alt ?? ''}
                    onChange={(e) => setEditing({ ...editing, alt: e.target.value })}
                  />
                </div>
                <div className="admin-ops-pc-field span-2">
                  <label>主图</label>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    hidden
                    onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
                  />
                  <button type="button" className="font-pill" disabled={busy} onClick={() => fileRef.current?.click()}>
                    上传主图
                  </button>
                </div>
                <div className="admin-ops-pc-field span-2">
                  <label>链接类型</label>
                  <select
                    className="search-input"
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
                </div>
                <div className="admin-ops-pc-field span-2">
                  <label>链接参数</label>
                  {linkFields}
                </div>
              </div>

              <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
                <code>{hrefPreview || '—'}</code>
              </p>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13 }}>
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
                <button
                  type="button"
                  className="text-link"
                  onClick={() => { setEditing(null); setActiveId(null); }}
                >
                  关闭
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
