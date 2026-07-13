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
  const [editing, setEditing] = useState<Partial<HeroBCampaignAdmin> & { link: HeroBLink } | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hrefPreview, setHrefPreview] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
    <div className="admin-ops-pc">
      {err ? <p className="admin-rag-error-text">{err}</p> : null}

      <div className="admin-ops-pc-head">
        <div>
          <h2>首页运营 · Hero B</h2>
          <p className="muted">左侧选活动，右侧编辑与预览。无活动时首页只展示每日经文。</p>
        </div>
        <div className="admin-ops-hero-toolbar" style={{ marginBottom: 0 }}>
          <button type="button" className="btn" onClick={() => startEdit()}>新建活动</button>
          <button type="button" className="text-link" onClick={() => void load()}>刷新</button>
        </div>
      </div>

      <div className="admin-ops-pc-body">
        <aside className="admin-ops-pc-list">
          {items.length === 0 ? (
            <p className="muted" style={{ fontSize: 13, padding: 8 }}>暂无活动</p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`card card-2 admin-ops-pc-card ${activeId === item.id && editing ? 'is-active' : ''}`}
                onClick={() => startEdit(item)}
              >
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={contentAssetUrl(item.imageUrl)}
                    alt=""
                    className="admin-ops-pc-card-thumb"
                  />
                ) : (
                  <div className="admin-ops-pc-card-thumb is-empty">无图</div>
                )}
                <div className="admin-ops-pc-card-meta">
                  <strong>{item.name}</strong>
                  <p className="muted">{item.href}</p>
                  <p className="muted">P{item.priority} · {item.audience === 'admin_preview' ? '仅预览' : '全员'}</p>
                </div>
                <div className="admin-ops-pc-card-badges">
                  <span className="pill">{statusLabel(item)}</span>
                  <span className="muted">{item.id}</span>
                </div>
              </button>
            ))
          )}
        </aside>

        <section className="admin-ops-pc-editor">
          {!editing ? (
            <div className="admin-ops-pc-editor-empty">
              <p className="muted">从左侧选择活动，或新建一条 Hero B 配置</p>
              <button type="button" className="btn" onClick={() => startEdit()}>新建活动</button>
            </div>
          ) : (
            <>
              <div className="section-row" style={{ marginTop: 0, marginBottom: 12 }}>
                <p className="settings-title" style={{ margin: 0 }}>{isNew ? '新建活动' : '编辑活动'}</p>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  {!isNew && editing.id ? (
                    <>
                      <button
                        type="button"
                        className="text-link"
                        onClick={() => {
                          void navigator.clipboard.writeText(adminHeroPreviewHint(String(editing.id)));
                        }}
                      >
                        复制预览 API
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
                  <button type="button" className="text-link" onClick={() => { setEditing(null); setActiveId(null); }}>
                    关闭
                  </button>
                </div>
              </div>

              <div className="admin-ops-pc-preview-wrap" style={{ marginBottom: 14 }}>
                <div className="admin-ops-pc-form-grid">
                  <div className="admin-ops-pc-field">
                    <label>活动 ID</label>
                    <input
                      className="search-input"
                      placeholder="英文 slug"
                      disabled={!isNew}
                      value={editing.id}
                      onChange={(e) => setEditing({ ...editing, id: e.target.value })}
                    />
                  </div>
                  <div className="admin-ops-pc-field">
                    <label>活动名称</label>
                    <input
                      className="search-input"
                      placeholder="运营内部名称"
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    />
                  </div>
                  <div className="admin-ops-pc-field">
                    <label>开始时间</label>
                    <input
                      className="search-input"
                      type="datetime-local"
                      value={String(editing.startAt)}
                      onChange={(e) => setEditing({ ...editing, startAt: e.target.value })}
                    />
                  </div>
                  <div className="admin-ops-pc-field">
                    <label>结束时间</label>
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
                    <label>角标（≤6 字）</label>
                    <input
                      className="search-input"
                      value={editing.badge ?? ''}
                      onChange={(e) => setEditing({ ...editing, badge: e.target.value })}
                    />
                  </div>
                  <div className="admin-ops-pc-field span-2">
                    <label>alt 无障碍描述</label>
                    <input
                      className="search-input"
                      value={editing.alt ?? ''}
                      onChange={(e) => setEditing({ ...editing, alt: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <div className="admin-ops-pc-field" style={{ marginBottom: 8 }}>
                    <label>主图预览</label>
                    {editing.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={contentAssetUrl(editing.imageUrl)}
                        alt="预览"
                        className="admin-ops-pc-live-preview"
                      />
                    ) : (
                      <div className="admin-ops-pc-live-preview admin-ops-pc-card-thumb is-empty" style={{ height: 'auto' }}>
                        上传 KV 图
                      </div>
                    )}
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    hidden
                    onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
                  />
                  <button
                    type="button"
                    className="font-pill"
                    disabled={busy}
                    onClick={() => fileRef.current?.click()}
                  >
                    上传主图
                  </button>
                </div>
              </div>

              <div className="admin-ops-pc-form-grid">
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
                解析结果：<code>{hrefPreview || '—'}</code>
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
                  取消
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
