'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  adminLogin,
  clearAdminToken,
  deleteRagDocument,
  fetchRagInventory,
  fetchRagStatus,
  reindexRagDocument,
  uploadRagDocument,
  type RagInventory,
  type RagInventoryCollection,
  type RagInventoryDoc,
  type RagInventoryStatus,
  type RagStatus,
} from '@/lib/admin_rag';

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`pill ${ok ? 'pill-active' : ''}`} style={{ fontSize: 11 }}>
      {label} {ok ? '✓' : '✗'}
    </span>
  );
}

const STATUS_LABELS: Record<RagInventoryStatus, string> = {
  indexed: '已入库',
  pending: '待索引',
  failed: '失败',
  indexing: '进行中',
  orphan: '仅数据库',
};

type StatusFilter = 'all' | RagInventoryStatus;

function InventoryStatusBadge({ status }: { status: RagInventoryStatus }) {
  return (
    <span className={`admin-rag-status-badge admin-rag-status-${status}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: RagInventoryStatus | 'total';
}) {
  return (
    <div className={`admin-rag-summary-card admin-rag-summary-${tone ?? 'total'}`}>
      <span className="admin-rag-summary-value">{value}</span>
      <span className="admin-rag-summary-label">{label}</span>
    </div>
  );
}

function CollectionBlock({
  collection,
  filter,
  busy,
  onDelete,
  onReindex,
}: {
  collection: RagInventoryCollection;
  filter: StatusFilter;
  busy: boolean;
  onDelete: (id: string, title: string) => void;
  onReindex: (id: string) => void;
}) {
  const [open, setOpen] = useState(collection.counts.pending > 0 || collection.counts.failed > 0);

  const docs = useMemo(() => {
    if (filter === 'all') return collection.documents;
    return collection.documents.filter((d) => d.inventory_status === filter);
  }, [collection.documents, filter]);

  if (!docs.length && filter !== 'all') return null;

  const c = collection.counts;
  const metaHint = collection.import_meta
    .map((m) => {
      if (m.books_done != null && m.books_total != null) {
        return `${m.title || m.id}：${m.books_done}/${m.books_total} 卷`;
      }
      return m.title || m.id;
    })
    .join(' · ');

  return (
    <div className="admin-rag-collection card card-2">
      <button
        type="button"
        className="admin-rag-collection-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div>
          <strong>{collection.label}</strong>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
            {collection.source_type} · {collection.dir}
            {!collection.dir_exists ? ' · 目录不存在' : ` · ${collection.file_count} 个文件`}
          </p>
          {metaHint ? (
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 11 }}>
              拉取进度：{metaHint}
            </p>
          ) : null}
        </div>
        <div className="admin-rag-collection-counts">
          <span className="admin-rag-mini-stat admin-rag-mini-indexed">{c.indexed} 已入库</span>
          <span className="admin-rag-mini-stat admin-rag-mini-pending">{c.pending} 待索引</span>
          <span className="admin-rag-mini-stat admin-rag-mini-failed">{c.failed} 失败</span>
          {c.indexing > 0 ? (
            <span className="admin-rag-mini-stat admin-rag-mini-indexing">{c.indexing} 进行中</span>
          ) : null}
        </div>
      </button>

      {open ? (
        <div className="admin-rag-doc-list">
          {docs.length === 0 ? (
            <p className="muted" style={{ fontSize: 12, padding: '0 12px 12px' }}>当前筛选下无文档</p>
          ) : (
            docs.map((d) => (
              <DocRow
                key={`${collection.id}-${d.file}`}
                doc={d}
                sourceType={collection.source_type}
                busy={busy}
                onDelete={onDelete}
                onReindex={onReindex}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function DocRow({
  doc,
  sourceType,
  busy,
  onDelete,
  onReindex,
}: {
  doc: RagInventoryDoc;
  sourceType: string;
  busy: boolean;
  onDelete: (id: string, title: string) => void;
  onReindex: (id: string) => void;
}) {
  return (
    <div className="card card-2 admin-rag-doc-item">
      <div className="admin-rag-doc-item-head">
        <strong style={{ fontSize: 14 }}>{doc.title}</strong>
        <InventoryStatusBadge status={doc.inventory_status} />
      </div>
      <p className="muted" style={{ margin: '4px 0', fontSize: 12 }}>
        {doc.filename}
        {doc.subgroup ? ` · ${doc.subgroup}` : ''}
        {doc.chunks ? ` · ${doc.chunks} 块` : ''}
        {doc.rag_index_at ? ` · ${new Date(doc.rag_index_at).toLocaleString()}` : ''}
      </p>
      <p className="muted" style={{ margin: 0, fontSize: 11 }}>
        {doc.source_type || sourceType}
        {doc.db_status ? ` · DB:${doc.db_status}` : ''}
      </p>
      {doc.rag_index_error ? (
        <p className="admin-rag-error-text">{doc.rag_index_error}</p>
      ) : null}
      {doc.document_id ? (
        <div className="share-actions" style={{ marginTop: 8 }}>
          <button
            type="button"
            className="font-pill"
            disabled={busy}
            onClick={() => onReindex(doc.document_id!)}
          >
            重建索引
          </button>
          <button
            type="button"
            className="font-pill"
            disabled={busy}
            onClick={() => onDelete(doc.document_id!, doc.title)}
          >
            删除
          </button>
        </div>
      ) : (
        <p className="muted" style={{ margin: '8px 0 0', fontSize: 11 }}>
          文件在磁盘上，尚未写入向量库。请执行 ensure_rag.sh 或重建索引。
        </p>
      )}
    </div>
  );
}

export default function AdminRagPanel({
  onLogout,
  showLogout = true,
}: {
  onLogout?: () => void;
  showLogout?: boolean;
}) {
  const [status, setStatus] = useState<RagStatus | null>(null);
  const [inventory, setInventory] = useState<RagInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('all');

  const [title, setTitle] = useState('');
  const [bookId, setBookId] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [st, inv] = await Promise.all([fetchRagStatus(), fetchRagInventory()]);
      setStatus(st);
      setInventory(inv);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleUpload = async () => {
    if (!file || !title.trim()) {
      setErr('请填写标题并选择 .md / .txt 文件');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await uploadRagDocument(file, title.trim(), 'commentary', bookId.trim() || undefined);
      setTitle('');
      setBookId('');
      setFile(null);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '上传失败');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string, docTitle: string) => {
    if (!window.confirm(`确定删除「${docTitle}」？此操作不可恢复。`)) return;
    setBusy(true);
    setErr(null);
    try {
      await deleteRagDocument(id);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '删除失败');
    } finally {
      setBusy(false);
    }
  };

  const handleReindex = async (id: string) => {
    setBusy(true);
    setErr(null);
    try {
      await reindexRagDocument(id);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '重建失败');
    } finally {
      setBusy(false);
    }
  };

  const summary = inventory?.summary;

  return (
    <div className="admin-rag-panel">
      <div className="section-row" style={{ marginTop: 0 }}>
        <p className="settings-title" style={{ margin: 0 }}>RAG 资料管理</p>
        {showLogout ? (
          <button
            type="button"
            className="text-link"
            onClick={() => {
              clearAdminToken();
              onLogout?.();
            }}
          >
            退出管理
          </button>
        ) : null}
      </div>

      {loading && !status ? (
        <p className="muted" style={{ fontSize: 13 }}>加载中…</p>
      ) : null}

      {status ? (
        <div className="admin-rag-status card card-2" style={{ marginTop: 10, padding: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            <StatusPill ok={status.rag_ready} label="RAG 就绪" />
            <StatusPill ok={status.db_ok} label="数据库" />
            <StatusPill ok={status.embedding_configured} label="Embedding" />
            <StatusPill ok={status.llm_configured} label="LLM" />
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            数据库 {status.documents} 篇 · 向量块 {status.chunks} 个
            {summary ? ` · 磁盘文件 ${summary.files_on_disk} 个` : ''}
          </p>
        </div>
      ) : null}

      {summary ? (
        <div className="admin-rag-summary-grid" style={{ marginTop: 10 }}>
          <SummaryCard label="已入库" value={summary.indexed} tone="indexed" />
          <SummaryCard label="待索引" value={summary.pending} tone="pending" />
          <SummaryCard label="失败" value={summary.failed} tone="failed" />
          <SummaryCard label="进行中" value={summary.indexing} tone="indexing" />
          <SummaryCard label="仅数据库" value={summary.orphan} tone="orphan" />
        </div>
      ) : null}

      <div className="admin-rag-upload card card-2" style={{ marginTop: 10, padding: 12 }}>
        <p className="settings-title" style={{ marginTop: 0 }}>上传资料</p>
        <input
          className="book-chip"
          style={{ width: '100%', marginBottom: 8, textAlign: 'left' }}
          placeholder="资料标题（如：约翰福音注释）"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          className="book-chip"
          style={{ width: '100%', marginBottom: 8, textAlign: 'left' }}
          placeholder="书卷 ID（可选，如 JHN）"
          value={bookId}
          onChange={(e) => setBookId(e.target.value.toUpperCase())}
        />
        <input
          type="file"
          accept=".md,.txt,.markdown,text/markdown,text/plain"
          style={{ fontSize: 13, marginBottom: 8, width: '100%' }}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button type="button" className="btn" style={{ width: '100%' }} disabled={busy} onClick={() => void handleUpload()}>
          {busy ? '处理中…' : '上传并索引'}
        </button>
      </div>

      <div style={{ marginTop: 10 }}>
        <div className="section-row">
          <p className="settings-title" style={{ margin: 0 }}>资料清单（按数据源）</p>
          <button type="button" className="text-link" disabled={busy} onClick={() => void refresh()}>
            刷新
          </button>
        </div>

        <div className="admin-rag-filter-tabs" role="tablist">
          {([
            ['all', '全部'],
            ['indexed', '已入库'],
            ['pending', '待索引'],
            ['failed', '失败'],
            ['indexing', '进行中'],
            ['orphan', '仅数据库'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id}
              className={`admin-rag-filter-tab ${filter === id ? 'is-active' : ''}`}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {!inventory ? (
          <p className="muted" style={{ fontSize: 13 }}>加载清单…</p>
        ) : inventory.collections.every((c) => c.file_count === 0) && inventory.orphans.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>
            暂无磁盘资料。请执行 ensure_rag.sh 拉取注释，或上传 Markdown。
          </p>
        ) : (
          <div className="admin-rag-collections">
            {inventory.collections.map((coll) => (
              <CollectionBlock
                key={coll.id}
                collection={coll}
                filter={filter}
                busy={busy}
                onDelete={handleDelete}
                onReindex={handleReindex}
              />
            ))}
            {inventory.orphans.length > 0 && (filter === 'all' || filter === 'orphan') ? (
              <div className="admin-rag-collection card card-2">
                <div className="admin-rag-collection-head" style={{ cursor: 'default' }}>
                  <div>
                    <strong>仅数据库（源文件缺失）</strong>
                    <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                      {inventory.orphans.length} 条记录找不到对应 md 文件
                    </p>
                  </div>
                </div>
                <div className="admin-rag-doc-list">
                  {inventory.orphans.map((d) => (
                    <div key={d.id} className="card card-2 admin-rag-doc-item">
                      <div className="admin-rag-doc-item-head">
                        <strong style={{ fontSize: 14 }}>{d.title}</strong>
                        <InventoryStatusBadge status="orphan" />
                      </div>
                      <p className="muted" style={{ margin: '4px 0', fontSize: 12 }}>
                        {d.source_type} · {d.chunks} 块
                        {d.source_path ? ` · ${d.source_path.split('/').pop()}` : ''}
                      </p>
                      <div className="share-actions" style={{ marginTop: 8 }}>
                        <button type="button" className="font-pill" disabled={busy} onClick={() => void handleReindex(d.id)}>
                          重建索引
                        </button>
                        <button type="button" className="font-pill" disabled={busy} onClick={() => void handleDelete(d.id, d.title)}>
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {inventory?.db_error ? (
        <p className="admin-rag-error-text" style={{ marginTop: 8 }}>
          数据库暂不可用，仅显示磁盘文件清单：{inventory.db_error}
        </p>
      ) : null}

      {err ? <p className="admin-rag-error-text" style={{ marginTop: 8 }}>{err}</p> : null}
    </div>
  );
}

export function AdminLoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await adminLogin(phone.trim(), password);
      onSuccess();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '登录失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-login-form">
      <p className="settings-title">管理员登录</p>
      <input
        className="book-chip"
        style={{ width: '100%', marginBottom: 8, textAlign: 'left' }}
        placeholder="手机号"
        inputMode="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <input
        className="book-chip"
        type="password"
        style={{ width: '100%', marginBottom: 8, textAlign: 'left' }}
        placeholder="密码"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button type="button" className="btn" style={{ width: '100%' }} disabled={busy} onClick={() => void submit()}>
        {busy ? '登录中…' : '登录'}
      </button>
      {err ? <p className="admin-rag-error-text" style={{ marginTop: 8 }}>{err}</p> : null}
    </div>
  );
}
