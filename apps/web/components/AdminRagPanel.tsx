'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  adminLogin,
  clearAdminToken,
  deleteRagDocument,
  fetchRagInventory,
  fetchRagStatus,
  indexPendingDisk,
  indexPendingUploads,
  indexUploadFile,
  RAG_SOURCE_TYPES,
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
  onIndexFile,
  onIndexPending,
}: {
  collection: RagInventoryCollection;
  filter: StatusFilter;
  busy: boolean;
  onDelete: (id: string, title: string) => void;
  onReindex: (id: string) => void;
  onIndexFile?: (doc: RagInventoryDoc, sourceType: string) => void;
  onIndexPending?: (sourceType: string, pendingCount: number) => void;
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
          {collection.id === 'uploads' && (c.pending > 0 || c.failed > 0) && onIndexPending ? (
            <div className="admin-rag-batch-bar">
              <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                {c.pending + c.failed} 个文件待向量化
              </p>
              <button
                type="button"
                className="font-pill"
                disabled={busy}
                onClick={() => onIndexPending(collection.source_type, c.pending + c.failed)}
              >
                一键向量化
              </button>
            </div>
          ) : null}
          {docs.length === 0 ? (
            <p className="muted" style={{ fontSize: 12, padding: '0 12px 12px' }}>当前筛选下无文档</p>
          ) : (
            docs.map((d) => (
              <DocRow
                key={`${collection.id}-${d.file}`}
                doc={d}
                sourceType={collection.source_type}
                busy={busy}
                canIndexFile={collection.id === 'uploads'}
                onDelete={onDelete}
                onReindex={onReindex}
                onIndexFile={onIndexFile}
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
  canIndexFile,
  onDelete,
  onReindex,
  onIndexFile,
}: {
  doc: RagInventoryDoc;
  sourceType: string;
  busy: boolean;
  canIndexFile?: boolean;
  onDelete: (id: string, title: string) => void;
  onReindex: (id: string) => void;
  onIndexFile?: (doc: RagInventoryDoc, sourceType: string) => void;
}) {
  const needsIndex = doc.inventory_status === 'pending' || doc.inventory_status === 'failed';
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
            重新向量化
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
      ) : canIndexFile && needsIndex && onIndexFile ? (
        <div className="share-actions" style={{ marginTop: 8 }}>
          <button
            type="button"
            className="font-pill"
            disabled={busy}
            onClick={() => onIndexFile(doc, sourceType)}
          >
            向量化
          </button>
        </div>
      ) : needsIndex ? (
        <p className="muted" style={{ margin: '8px 0 0', fontSize: 11 }}>
          文件在磁盘上，尚未写入向量库。
        </p>
      ) : null}
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
  const [sourceType, setSourceType] = useState('commentary');
  const [files, setFiles] = useState<File[]>([]);
  const [uploadOk, setUploadOk] = useState<string | null>(null);
  const [repairConfirm, setRepairConfirm] = useState(false);
  const [repairProgress, setRepairProgress] = useState<string | null>(null);

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
    if (files.length === 0) {
      setErr('请选择 .md / .txt 文件');
      return;
    }
    if (files.length === 1 && !title.trim()) {
      setErr('单文件上传请填写标题');
      return;
    }
    setBusy(true);
    setErr(null);
    setUploadOk(null);
    const messages: string[] = [];
    try {
      for (let i = 0; i < files.length; i += 1) {
        const f = files[i]!;
        const docTitle = files.length === 1
          ? title.trim()
          : title.trim() || f.name.replace(/\.(md|txt|markdown)$/i, '');
        const res = await uploadRagDocument(f, docTitle, sourceType, bookId.trim() || undefined);
        messages.push(res.message ?? `「${docTitle}」上传完成`);
      }
      setUploadOk(messages.join('；'));
      setTitle('');
      setBookId('');
      setFiles([]);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '上传失败');
    } finally {
      setBusy(false);
    }
  };

  const handleIndexFile = async (doc: RagInventoryDoc, st: string) => {
    setBusy(true);
    setErr(null);
    setUploadOk(null);
    try {
      const res = await indexUploadFile(doc.filename, { title: doc.title, sourceType: st });
      setUploadOk(res.message ?? `「${doc.title}」向量化完成`);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '向量化失败');
    } finally {
      setBusy(false);
    }
  };

  const handleIndexPendingDisk = async () => {
    const pending = (summary?.pending ?? 0) + (summary?.failed ?? 0);
    if (pending === 0) {
      setErr('当前没有待索引或失败的磁盘文件');
      return;
    }
    setBusy(true);
    setErr(null);
    setUploadOk(null);
    setRepairConfirm(false);
    setRepairProgress(`准备处理约 ${pending} 个文件…`);
    try {
      let totalIndexed = 0;
      let totalSkipped = 0;
      let totalFailed = 0;
      let rounds = 0;
      let hasMore = true;
      while (hasMore) {
        rounds += 1;
        setRepairProgress(`第 ${rounds} 批向量化中…（已完成 ${totalIndexed + totalSkipped + totalFailed} 个）`);
        const res = await indexPendingDisk();
        totalIndexed += res.indexed;
        totalSkipped += res.skipped;
        totalFailed += res.failed;
        hasMore = res.has_more;
        if (hasMore) {
          setRepairProgress(
            `第 ${rounds} 批完成：成功 ${res.indexed}，跳过 ${res.skipped}，失败 ${res.failed}；剩余约 ${res.remaining} 个…`,
          );
          await refresh();
        }
      }
      setRepairProgress(null);
      setUploadOk(
        `修复完成：成功 ${totalIndexed} 个，跳过 ${totalSkipped} 个，失败 ${totalFailed} 个（共 ${rounds} 批）`,
      );
      await refresh();
    } catch (e) {
      setRepairProgress(null);
      setErr(e instanceof Error ? e.message : '批量向量化失败');
    } finally {
      setBusy(false);
    }
  };

  const handleIndexPending = async (st: string, count: number) => {
    if (!window.confirm(`确定向量化 ${count} 个待处理上传文件？`)) return;
    setBusy(true);
    setErr(null);
    setUploadOk(null);
    try {
      const res = await indexPendingUploads(st);
      setUploadOk(`已向量化 ${res.indexed} 个，跳过 ${res.skipped} 个，失败 ${res.failed} 个`);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '批量向量化失败');
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
    setUploadOk(null);
    try {
      const msg = await reindexRagDocument(id);
      setUploadOk(msg);
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

      {summary && (summary.pending > 0 || summary.failed > 0) ? (
        <div className="admin-rag-repair-bar card card-2" style={{ marginTop: 10, padding: 12 }}>
          <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
            检测到 {summary.pending} 个待索引、{summary.failed} 个失败。
            通常是路径未对齐或发版后尚未向量化，可一键修复（每批 8 个，避免超时）。
          </p>
          {repairProgress ? (
            <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>{repairProgress}</p>
          ) : null}
          <div className="entity-knowledge-foot" style={{ marginTop: 0 }}>
            {repairConfirm ? (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ flex: 1 }}
                disabled={busy}
                onClick={() => setRepairConfirm(false)}
              >
                取消
              </button>
            ) : null}
            <button
              type="button"
              className="btn"
              style={{ flex: 1 }}
              disabled={busy}
              onClick={() => {
                if (!repairConfirm) {
                  setRepairConfirm(true);
                  return;
                }
                void handleIndexPendingDisk();
              }}
            >
              {busy
                ? '向量化中…'
                : repairConfirm
                  ? `确认修复 ${summary.pending + summary.failed} 个文件`
                  : '修复：向量化全部待处理文件'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="admin-rag-upload card card-2" style={{ marginTop: 10, padding: 12 }}>
        <p className="settings-title" style={{ marginTop: 0 }}>上传资料</p>
        <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
          上传后自动切块并向量化入库，立即可用于小爱检索。
        </p>
        <select
          className="book-chip admin-rag-select"
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value)}
        >
          {RAG_SOURCE_TYPES.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <input
          className="book-chip"
          style={{ width: '100%', marginBottom: 8, textAlign: 'left' }}
          placeholder="资料标题（单文件必填；多文件可留空用文件名）"
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
          multiple
          accept=".md,.txt,.markdown,text/markdown,text/plain"
          style={{ fontSize: 13, marginBottom: 8, width: '100%' }}
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
        {files.length > 0 ? (
          <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
            已选 {files.length} 个文件
          </p>
        ) : null}
        <button type="button" className="btn" style={{ width: '100%' }} disabled={busy} onClick={() => void handleUpload()}>
          {busy ? '向量化中…' : '上传并向量化'}
        </button>
        {uploadOk ? (
          <p className="admin-rag-success-text" style={{ marginTop: 8 }}>{uploadOk}</p>
        ) : null}
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
                onIndexFile={handleIndexFile}
                onIndexPending={handleIndexPending}
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
