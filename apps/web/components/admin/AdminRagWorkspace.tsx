'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  createRagWorkspaceFile,
  deleteRagWorkspace,
  fetchRagStatus,
  fetchRagWorkspaceChunks,
  fetchRagWorkspaceFile,
  fetchRagWorkspaceTree,
  importRagSources,
  indexPendingDisk,
  indexRagCollections,
  indexRagWorkspaceFile,
  mkdirRagWorkspace,
  moveRagWorkspace,
  saveRagWorkspaceFile,
  uploadRagDocument,
  type RagInventoryStatus,
  type RagStatus,
  type RagWorkspaceChunk,
  type RagWorkspaceCollection,
  type RagWorkspaceFile,
  type RagWorkspaceNode,
  type RagWorkspaceTree,
} from '@/lib/admin_rag';

const STATUS_LABELS: Record<RagInventoryStatus, string> = {
  indexed: '已入库',
  pending: '待索引',
  failed: '失败',
  indexing: '进行中',
  orphan: '仅数据库',
};

type StatusFilter = 'all' | RagInventoryStatus;
type DetailTab = 'preview' | 'edit' | 'chunks';

type Selection =
  | { kind: 'collection'; collectionId: string }
  | { kind: 'folder'; collectionId: string; path: string }
  | { kind: 'file'; collectionId: string; path: string };

function StatusDot({ status }: { status?: RagInventoryStatus }) {
  if (!status) return null;
  return (
    <span
      className={`admin-ws-dot admin-ws-dot-${status}`}
      title={STATUS_LABELS[status]}
      aria-label={STATUS_LABELS[status]}
    />
  );
}

function MetricChip({
  label,
  value,
  active,
  onClick,
  tone,
}: {
  label: string;
  value: number;
  active?: boolean;
  onClick?: () => void;
  tone?: string;
}) {
  return (
    <button
      type="button"
      className={`admin-ws-metric ${tone ? `admin-ws-metric-${tone}` : ''} ${active ? 'is-active' : ''}`}
      onClick={onClick}
    >
      <strong>{value}</strong>
      <span>{label}</span>
    </button>
  );
}

export default function AdminRagWorkspace() {
  const uploadRef = useRef<HTMLInputElement>(null);
  const [tree, setTree] = useState<RagWorkspaceTree | null>(null);
  const [status, setStatus] = useState<RagStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Selection | null>(null);
  const [file, setFile] = useState<RagWorkspaceFile | null>(null);
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>('preview');
  const [chunks, setChunks] = useState<RagWorkspaceChunk[]>([]);
  const [chunkTotal, setChunkTotal] = useState(0);
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set());

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [t, s] = await Promise.all([fetchRagWorkspaceTree(), fetchRagStatus()]);
      setTree(t);
      setStatus(s);
      setExpanded((prev) => {
        if (prev.size) return prev;
        const next = new Set<string>();
        for (const c of t.collections) {
          if ((c.counts.pending || 0) + (c.counts.failed || 0) > 0 || c.writable) {
            next.add(c.id);
          }
        }
        return next;
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openFile = useCallback(async (collectionId: string, path: string) => {
    setSelected({ kind: 'file', collectionId, path });
    setMsg(null);
    try {
      const f = await fetchRagWorkspaceFile(collectionId, path);
      setFile(f);
      setDraft(f.content);
      setDirty(false);
      setDetailTab(f.writable ? 'edit' : 'preview');
      setChunks([]);
      setChunkTotal(0);
      if (f.document_id) {
        try {
          const c = await fetchRagWorkspaceChunks(f.document_id);
          setChunks(c.chunks);
          setChunkTotal(c.total);
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '打开失败');
    }
  }, []);

  const summary = tree?.summary;
  const collections = tree?.collections ?? [];

  const filterNode = useCallback(
    (node: RagWorkspaceNode): boolean => {
      if (node.type === 'folder') {
        return (node.children || []).some(filterNode);
      }
      if (filter !== 'all' && node.inventory_status !== filter) return false;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        const hay = `${node.name} ${node.title || ''} ${node.path}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    },
    [filter, query],
  );

  const visibleCollections = useMemo(() => {
    return collections
      .map((c) => {
        const children = (c.children || [])
          .map((node) => {
            if (node.type === 'folder') {
              const kids = (node.children || []).filter(filterNode);
              if (!kids.length && (filter !== 'all' || query.trim())) return null;
              return { ...node, children: kids };
            }
            return filterNode(node) ? node : null;
          })
          .filter(Boolean) as RagWorkspaceNode[];
        if (!children.length && (filter !== 'all' || query.trim())) return null;
        return { ...c, children };
      })
      .filter(Boolean) as RagWorkspaceCollection[];
  }, [collections, filter, filterNode, query]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const r = await fn();
      setMsg(typeof r === 'string' ? r : `${label}完成`);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : `${label}失败`);
    } finally {
      setBusy(false);
    }
  };

  const onSave = async () => {
    if (!file || !file.writable) return;
    setBusy(true);
    setErr(null);
    try {
      const saved = await saveRagWorkspaceFile(file.collection_id, file.path, draft);
      setFile(saved);
      setDraft(saved.content);
      setDirty(false);
      setMsg('已保存，标记为待重新索引');
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const onIndex = async () => {
    if (!selected || selected.kind !== 'file') return;
    await run('索引', async () => {
      const r = await indexRagWorkspaceFile(selected.collectionId, selected.path, true);
      setFile(r.file);
      setDraft(r.file.content);
      setDirty(false);
      if (r.file.document_id) {
        const c = await fetchRagWorkspaceChunks(r.file.document_id);
        setChunks(c.chunks);
        setChunkTotal(c.total);
      }
      return r.index?.error ? `索引异常：${r.index.error}` : '索引完成';
    });
  };

  const promptName = (title: string, initial = '') => {
    const v = window.prompt(title, initial);
    return v?.trim() || null;
  };

  const currentWritableCollection = selected
    ? collections.find((c) => c.id === selected.collectionId)
    : null;

  const parentPathForCreate = () => {
    if (!selected) return '';
    if (selected.kind === 'folder') return selected.path;
    if (selected.kind === 'file') {
      const parts = selected.path.split('/');
      return parts.length > 1 ? parts.slice(0, -1).join('/') : '';
    }
    return '';
  };

  const onMkdir = async () => {
    const coll = currentWritableCollection;
    if (!coll?.writable) {
      setErr('请先选中可写集合（中文自有 / 手工 / 上传区）');
      return;
    }
    const name = promptName('新建文件夹名称');
    if (!name) return;
    const base = parentPathForCreate();
    const path = base ? `${base}/${name}` : name;
    await run('新建文件夹', () => mkdirRagWorkspace(coll.id, path));
  };

  const onCreateFile = async () => {
    const coll = currentWritableCollection;
    if (!coll?.writable) {
      setErr('请先选中可写集合');
      return;
    }
    let name = promptName('新建文件名（含 .md）', 'untitled.md');
    if (!name) return;
    if (!/\.(md|txt|markdown)$/i.test(name)) name = `${name}.md`;
    const base = parentPathForCreate();
    const path = base ? `${base}/${name}` : name;
    await run('新建文件', async () => {
      const f = await createRagWorkspaceFile(coll.id, path);
      await openFile(coll.id, f.path);
      return '已创建';
    });
  };

  const onRename = async () => {
    if (!selected || selected.kind === 'collection') return;
    const coll = collections.find((c) => c.id === selected.collectionId);
    if (!coll?.writable) {
      setErr('只读集合不可重命名');
      return;
    }
    const parts = selected.path.split('/');
    const cur = parts[parts.length - 1];
    const next = promptName('重命名为', cur);
    if (!next || next === cur) return;
    const parent = parts.slice(0, -1).join('/');
    const toPath = parent ? `${parent}/${next}` : next;
    await run('重命名', async () => {
      const r = await moveRagWorkspace({
        collectionId: selected.collectionId,
        fromPath: selected.path,
        toPath,
      });
      if (selected.kind === 'file') await openFile(r.collection_id, r.path);
      return '已重命名';
    });
  };

  const onDelete = async () => {
    if (!selected || selected.kind === 'collection') return;
    const coll = collections.find((c) => c.id === selected.collectionId);
    if (!coll?.writable) {
      setErr('只读集合不可删除');
      return;
    }
    if (!window.confirm(`确定删除「${selected.path}」？将同步清理数据库索引。`)) return;
    await run('删除', async () => {
      await deleteRagWorkspace(selected.collectionId, selected.path, true);
      setSelected(null);
      setFile(null);
      return '已删除';
    });
  };

  const onMove = async () => {
    if (!selected || selected.kind === 'collection') return;
    const coll = collections.find((c) => c.id === selected.collectionId);
    if (!coll?.writable) {
      setErr('只读集合不可移动');
      return;
    }
    const toPath = promptName('移动到新路径（相对集合根）', selected.path);
    if (!toPath || toPath === selected.path) return;
    await run('移动', async () => {
      const r = await moveRagWorkspace({
        collectionId: selected.collectionId,
        fromPath: selected.path,
        toPath,
      });
      if (selected.kind === 'file') await openFile(r.collection_id, r.path);
      else setSelected({ kind: 'folder', collectionId: r.collection_id, path: r.path });
      return '已移动';
    });
  };

  const onUpload = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    const coll = currentWritableCollection;
    const sourceType = coll?.source_type || 'commentary';
    const title = file.name.replace(/\.(md|txt|markdown)$/i, '');
    await run('上传', async () => {
      const r = await uploadRagDocument(file, title, sourceType);
      await reload();
      return r.message || '已上传到暂存区';
    });
  };

  const onBatchIndex = async () => {
    const keys = [...batchSelected];
    if (!keys.length) return;
    setBusy(true);
    setErr(null);
    let ok = 0;
    try {
      for (const key of keys) {
        const [collectionId, ...rest] = key.split('::');
        const path = rest.join('::');
        await indexRagWorkspaceFile(collectionId, path, true);
        ok += 1;
      }
      setMsg(`批量索引完成 ${ok}/${keys.length}`);
      setBatchSelected(new Set());
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '批量索引失败');
    } finally {
      setBusy(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleBatch = (collectionId: string, path: string, on: boolean) => {
    const key = `${collectionId}::${path}`;
    setBatchSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const renderNode = (collection: RagWorkspaceCollection, node: RagWorkspaceNode, depth: number) => {
    if (node.type === 'folder') {
      const id = `${collection.id}/${node.path}`;
      const open = expanded.has(id);
      return (
        <div key={id} className="admin-ws-tree-folder">
          <button
            type="button"
            className={`admin-ws-tree-row is-folder ${selected?.kind === 'folder' && selected.path === node.path && selected.collectionId === collection.id ? 'is-selected' : ''}`}
            style={{ paddingLeft: 8 + depth * 14 }}
            onClick={() => {
              toggleExpand(id);
              setSelected({ kind: 'folder', collectionId: collection.id, path: node.path });
            }}
          >
            <span className="admin-ws-tree-caret">{open ? '▾' : '▸'}</span>
            <span className="admin-ws-tree-name">{node.name}</span>
          </button>
          {open
            ? (node.children || []).map((child) => renderNode(collection, child, depth + 1))
            : null}
        </div>
      );
    }

    const batchKey = `${collection.id}::${node.path}`;
    const isSel =
      selected?.kind === 'file' &&
      selected.collectionId === collection.id &&
      selected.path === node.path;

    return (
      <div
        key={`${collection.id}:${node.path}`}
        className={`admin-ws-tree-row is-file ${isSel ? 'is-selected' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        {collection.writable ? (
          <label className="admin-ws-tree-check" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={batchSelected.has(batchKey)}
              onChange={(e) => toggleBatch(collection.id, node.path, e.target.checked)}
            />
          </label>
        ) : (
          <span className="admin-ws-tree-check-spacer" />
        )}
        <button
          type="button"
          className="admin-ws-tree-file-btn"
          onClick={() => void openFile(collection.id, node.path)}
        >
          <StatusDot status={node.inventory_status} />
          <span className="admin-ws-tree-name">{node.title || node.name}</span>
          {node.chunks ? <span className="muted admin-ws-tree-meta">{node.chunks}</span> : null}
        </button>
      </div>
    );
  };

  return (
    <div className="admin-ws">
      <header className="admin-ws-top">
        <div className="admin-ws-top-metrics">
          <MetricChip
            label="磁盘文件"
            value={summary?.files_on_disk ?? 0}
            tone="total"
            active={filter === 'all'}
            onClick={() => setFilter('all')}
          />
          <MetricChip
            label="已索引"
            value={summary?.indexed ?? 0}
            tone="indexed"
            active={filter === 'indexed'}
            onClick={() => setFilter('indexed')}
          />
          <MetricChip
            label="待索引"
            value={summary?.pending ?? 0}
            tone="pending"
            active={filter === 'pending'}
            onClick={() => setFilter('pending')}
          />
          <MetricChip
            label="失败"
            value={summary?.failed ?? 0}
            tone="failed"
            active={filter === 'failed'}
            onClick={() => setFilter('failed')}
          />
          <MetricChip label="向量块" value={summary?.db_chunks ?? 0} tone="total" />
          <MetricChip
            label="孤儿"
            value={summary?.orphan ?? 0}
            tone="orphan"
            active={filter === 'orphan'}
            onClick={() => setFilter('orphan')}
          />
        </div>
        <div className="admin-ws-top-status">
          <span className={`pill ${status?.rag_ready ? 'pill-active' : ''}`}>
            RAG {status?.rag_ready ? '就绪' : '未就绪'}
          </span>
          <span className={`pill ${status?.embedding_configured ? 'pill-active' : ''}`}>
            Embedding {status?.embedding_configured ? '✓' : '✗'}
          </span>
          <span className={`pill ${status?.db_ok ? 'pill-active' : ''}`}>
            DB {status?.db_ok ? '✓' : '✗'}
          </span>
        </div>
      </header>

      <div className="admin-ws-toolbar">
        <input
          className="admin-ws-search"
          placeholder="搜索文件名 / 标题…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="admin-ws-toolbar-actions">
          <button type="button" className="font-pill" disabled={busy} onClick={() => void reload()}>
            刷新
          </button>
          <button type="button" className="font-pill" disabled={busy} onClick={() => void onMkdir()}>
            新建文件夹
          </button>
          <button type="button" className="font-pill" disabled={busy} onClick={() => void onCreateFile()}>
            新建文件
          </button>
          <button type="button" className="font-pill" disabled={busy} onClick={() => void onRename()}>
            重命名
          </button>
          <button type="button" className="font-pill" disabled={busy} onClick={() => void onMove()}>
            移动
          </button>
          <button type="button" className="font-pill" disabled={busy} onClick={() => void onDelete()}>
            删除
          </button>
          <input
            ref={uploadRef}
            type="file"
            accept=".md,.txt,.markdown,text/markdown,text/plain"
            hidden
            onChange={(e) => {
              void onUpload(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="font-pill"
            disabled={busy}
            onClick={() => uploadRef.current?.click()}
          >
            上传
          </button>
          {batchSelected.size > 0 ? (
            <button type="button" className="btn" disabled={busy} onClick={() => void onBatchIndex()}>
              批量索引 ({batchSelected.size})
            </button>
          ) : null}
          <button
            type="button"
            className="font-pill"
            disabled={busy}
            onClick={() =>
              void run('拉取公版', async () => {
                const r = await importRagSources();
                return r.ok ? `完成 ${r.steps?.length ?? 0} 步` : '拉取完成';
              })
            }
          >
            拉取公版
          </button>
          <button
            type="button"
            className="font-pill"
            disabled={busy}
            onClick={() =>
              void run('索引集合', async () => {
                const r = await indexRagCollections();
                return `已索引分组 ${r.indexed_groups ?? 0}`;
              })
            }
          >
            索引集合
          </button>
          <button
            type="button"
            className="font-pill"
            disabled={busy}
            onClick={() =>
              void run('索引磁盘待处理', async () => {
                const r = await indexPendingDisk();
                return `处理 ${r.processed ?? 0} · 成功 ${r.indexed ?? 0} · 失败 ${r.failed ?? 0}`;
              })
            }
          >
            索引待处理
          </button>
        </div>
      </div>

      {err ? <p className="admin-rag-error-text">{err}</p> : null}
      {msg ? <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>{msg}</p> : null}

      <div className="admin-ws-body">
        <aside className="admin-ws-left">
          {loading && !tree ? (
            <p className="muted" style={{ fontSize: 13, padding: 12 }}>加载中…</p>
          ) : (
            visibleCollections.map((coll) => {
              const open = expanded.has(coll.id);
              return (
                <div key={coll.id} className="admin-ws-collection">
                  <button
                    type="button"
                    className={`admin-ws-collection-head ${selected?.collectionId === coll.id && selected.kind === 'collection' ? 'is-selected' : ''}`}
                    onClick={() => {
                      toggleExpand(coll.id);
                      setSelected({ kind: 'collection', collectionId: coll.id });
                    }}
                  >
                    <span className="admin-ws-tree-caret">{open ? '▾' : '▸'}</span>
                    <div className="admin-ws-collection-meta">
                      <strong>
                        {coll.label}
                        {coll.writable ? '' : ' · 只读'}
                      </strong>
                      <span className="muted">
                        {coll.file_count} 文件 · 待 {coll.counts.pending || 0} · 败 {coll.counts.failed || 0}
                      </span>
                    </div>
                  </button>
                  {open
                    ? coll.children.map((node) => renderNode(coll, node, 1))
                    : null}
                </div>
              );
            })
          )}
          {tree?.orphans?.length ? (
            <div className="admin-ws-orphans">
              <p className="settings-title" style={{ margin: '12px 8px 6px', fontSize: 13 }}>
                孤儿文档（仅库）
              </p>
              {tree.orphans.slice(0, 20).map((o) => (
                <div key={o.id} className="admin-ws-tree-row is-file" style={{ paddingLeft: 22 }}>
                  <StatusDot status="orphan" />
                  <span className="admin-ws-tree-name">{o.title}</span>
                </div>
              ))}
            </div>
          ) : null}
        </aside>

        <section className="admin-ws-right">
          {!file || selected?.kind !== 'file' ? (
            <div className="admin-ws-empty">
              <p className="muted">从左侧选择文件查看状态与预览</p>
              <p className="muted" style={{ fontSize: 12 }}>
                公版目录只读；中文自有 / 手工 / 上传区可新建、编辑、删除
              </p>
            </div>
          ) : (
            <>
              <div className="admin-ws-file-head">
                <div>
                  <h3 style={{ margin: 0 }}>{file.title}</h3>
                  <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                    {file.collection_id} / {file.path}
                    {file.content_stale ? ' · 内容已更新，待重新索引' : ''}
                  </p>
                </div>
                <div className="admin-ws-file-actions">
                  <span className={`admin-rag-status-badge admin-rag-status-${file.inventory_status}`}>
                    {file.inventory_label}
                  </span>
                  {file.writable && dirty ? (
                    <button type="button" className="btn" disabled={busy} onClick={() => void onSave()}>
                      保存
                    </button>
                  ) : null}
                  <button type="button" className="font-pill" disabled={busy} onClick={() => void onIndex()}>
                    {file.document_id ? '重新索引' : '索引入库'}
                  </button>
                </div>
              </div>

              <div className="admin-ws-file-meta">
                <span>类型 {file.source_type || '—'}</span>
                <span>大小 {Math.round((file.size_bytes || 0) / 1024)} KB</span>
                <span>块 {file.chunks || chunkTotal || 0}</span>
                <span>索引于 {file.rag_index_at?.slice(0, 19).replace('T', ' ') || '—'}</span>
                {file.rag_index_error ? (
                  <span className="admin-rag-error-text">错误：{file.rag_index_error}</span>
                ) : null}
              </div>

              <div className="admin-ws-detail-tabs">
                <button
                  type="button"
                  className={detailTab === 'preview' ? 'is-active' : ''}
                  onClick={() => setDetailTab('preview')}
                >
                  预览
                </button>
                {file.writable ? (
                  <button
                    type="button"
                    className={detailTab === 'edit' ? 'is-active' : ''}
                    onClick={() => setDetailTab('edit')}
                  >
                    编辑{dirty ? ' *' : ''}
                  </button>
                ) : null}
                <button
                  type="button"
                  className={detailTab === 'chunks' ? 'is-active' : ''}
                  onClick={() => setDetailTab('chunks')}
                >
                  Chunks ({chunkTotal || file.chunks || 0})
                </button>
              </div>

              {detailTab === 'preview' ? (
                <div className="admin-ws-preview">
                  <ReactMarkdown>{file.content.slice(0, 40000)}</ReactMarkdown>
                </div>
              ) : null}

              {detailTab === 'edit' && file.writable ? (
                <textarea
                  className="admin-ws-editor"
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    setDirty(e.target.value !== file.content);
                  }}
                  spellCheck={false}
                />
              ) : null}

              {detailTab === 'chunks' ? (
                <div className="admin-ws-chunks">
                  {!chunks.length ? (
                    <p className="muted" style={{ fontSize: 13 }}>暂无向量块，请先索引</p>
                  ) : (
                    chunks.map((c) => (
                      <article key={c.index} className="admin-ws-chunk">
                        <header>
                          <strong>#{c.index}</strong>
                          <span className="muted">{c.length} 字</span>
                        </header>
                        <p>{c.preview}</p>
                      </article>
                    ))
                  )}
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
