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
  purgeRagOrphans,
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
type DetailMode = 'split' | 'preview' | 'edit';

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
  const [mode, setMode] = useState<DetailMode>('split');
  const [showChunks, setShowChunks] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [chunks, setChunks] = useState<RagWorkspaceChunk[]>([]);
  const [chunkTotal, setChunkTotal] = useState(0);
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState<string | null>(null);

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

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const openFile = useCallback(async (collectionId: string, path: string) => {
    setSelected({ kind: 'file', collectionId, path });
    setMsg(null);
    setShowChunks(false);
    try {
      const f = await fetchRagWorkspaceFile(collectionId, path);
      setFile(f);
      setDraft(f.content);
      setDirty(false);
      setMode(f.writable ? 'split' : 'preview');
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

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ collectionId: string; path: string }>).detail;
      if (detail?.collectionId && detail?.path) {
        void openFile(detail.collectionId, detail.path);
      }
    };
    window.addEventListener('admin-rag-open', onOpen);
    return () => window.removeEventListener('admin-rag-open', onOpen);
  }, [openFile]);

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
    setMenuOpen(false);
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
      const r = await indexRagWorkspaceFile(selected.collectionId, selected.path, true, () => {
        setMsg('索引任务进行中…');
      });
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
    let name = promptName('新建页面文件名（含 .md）', 'untitled.md');
    if (!name) return;
    if (!/\.(md|txt|markdown)$/i.test(name)) name = `${name}.md`;
    const base = parentPathForCreate();
    const path = base ? `${base}/${name}` : name;
    await run('新建页面', async () => {
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

  const onPurgeOrphans = async () => {
    const count = tree?.orphans?.length ?? 0;
    if (!count) {
      setMsg('没有孤儿文档');
      return;
    }
    if (
      !window.confirm(
        `确定一键删除 ${count} 条孤儿文档（仅数据库、磁盘无文件）？此操作不可恢复。`,
      )
    ) {
      return;
    }
    await run('清除孤儿', async () => {
      const r = await purgeRagOrphans();
      return `已删除 ${r.deleted} 条孤儿文档`;
    });
  };

  const onUpload = async (fileList: FileList | null) => {
    const f = fileList?.[0];
    if (!f) return;
    const coll = currentWritableCollection;
    const sourceType = coll?.source_type || 'commentary';
    const title = f.name.replace(/\.(md|txt|markdown)$/i, '');
    await run('上传', async () => {
      const r = await uploadRagDocument(f, title, sourceType);
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
      setBatchSelected(new Set());
      setMsg(`批量索引完成 ${ok}/${keys.length}`);
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

  const dropTargetKey = (collectionId: string, folderPath: string) =>
    `${collectionId}::${folderPath || ''}`;

  const onDropMove = async (
    collectionId: string,
    folderPath: string,
    fromKey: string,
  ) => {
    const [fromColl, ...rest] = fromKey.split('::');
    const fromPath = rest.join('::');
    if (fromColl !== collectionId) {
      setErr('暂不支持跨集合拖拽，请用「移动」');
      return;
    }
    const name = fromPath.split('/').pop() || fromPath;
    const toPath = folderPath ? `${folderPath}/${name}` : name;
    if (toPath === fromPath) return;
    await run('拖拽移动', async () => {
      const r = await moveRagWorkspace({
        collectionId,
        fromPath,
        toPath,
      });
      await openFile(r.collection_id, r.path);
      return '已移动';
    });
  };

  const renderNode = (collection: RagWorkspaceCollection, node: RagWorkspaceNode, depth: number) => {
    const pad = 10 + depth * 14;
    if (node.type === 'folder') {
      const id = `${collection.id}:${node.path}`;
      const open = expanded.has(id);
      const dropKey = dropTargetKey(collection.id, node.path);
      return (
        <div key={id} className="admin-notion-folder">
          <div
            className={`admin-notion-row is-folder ${selected?.kind === 'folder' && selected.path === node.path && selected.collectionId === collection.id ? 'is-selected' : ''} ${dragOver === dropKey ? 'is-drop' : ''}`}
            style={{ paddingLeft: pad }}
            onDragOver={(e) => {
              if (!collection.writable) return;
              e.preventDefault();
              setDragOver(dropKey);
            }}
            onDragLeave={() => setDragOver((k) => (k === dropKey ? null : k))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(null);
              const from = e.dataTransfer.getData('text/plain');
              if (from) void onDropMove(collection.id, node.path, from);
            }}
          >
            <button
              type="button"
              className="admin-notion-row-main"
              onClick={() => {
                toggleExpand(id);
                setSelected({ kind: 'folder', collectionId: collection.id, path: node.path });
              }}
            >
              <span className="admin-ws-tree-caret">{open ? '▾' : '▸'}</span>
              <span className="admin-notion-icon is-folder" aria-hidden />
              <span className="admin-ws-tree-name">{node.name}</span>
            </button>
          </div>
          {open ? (node.children || []).map((child) => renderNode(collection, child, depth + 1)) : null}
        </div>
      );
    }

    const key = `${collection.id}::${node.path}`;
    const isSel =
      selected?.kind === 'file' &&
      selected.collectionId === collection.id &&
      selected.path === node.path;

    return (
      <div
        key={key}
        className={`admin-notion-row is-file ${isSel ? 'is-selected' : ''}`}
        style={{ paddingLeft: pad }}
        draggable={!!collection.writable}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', key);
          e.dataTransfer.effectAllowed = 'move';
        }}
      >
        {collection.writable ? (
          <label className="admin-ws-tree-check" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={batchSelected.has(key)}
              onChange={(e) => {
                setBatchSelected((prev) => {
                  const next = new Set(prev);
                  if (e.target.checked) next.add(key);
                  else next.delete(key);
                  return next;
                });
              }}
            />
          </label>
        ) : (
          <span className="admin-ws-tree-check-spacer" />
        )}
        <button
          type="button"
          className="admin-notion-row-main"
          onClick={() => void openFile(collection.id, node.path)}
        >
          <StatusDot status={node.inventory_status} />
          <span className="admin-notion-icon is-file" aria-hidden />
          <span className="admin-ws-tree-name">{node.title || node.name}</span>
        </button>
      </div>
    );
  };

  const views: { id: StatusFilter; label: string; count?: number }[] = [
    { id: 'all', label: '全部', count: summary?.files_on_disk },
    { id: 'pending', label: '待索引', count: summary?.pending },
    { id: 'failed', label: '失败', count: summary?.failed },
    { id: 'orphan', label: '孤儿', count: summary?.orphan },
  ];

  return (
    <div className="admin-notion">
      <aside className="admin-notion-sidebar">
        <div className="admin-notion-side-head">
          <input
            className="admin-notion-search"
            placeholder="筛选页面…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="admin-notion-views">
            {views.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`admin-notion-view ${filter === v.id ? 'is-active' : ''}`}
                onClick={() => setFilter(v.id)}
              >
                {v.label}
                {typeof v.count === 'number' ? <em>{v.count}</em> : null}
              </button>
            ))}
          </div>
        </div>

        <div className="admin-notion-tree">
          {loading && !tree ? (
            <p className="muted" style={{ fontSize: 13, padding: 12 }}>加载中…</p>
          ) : (
            visibleCollections.map((coll) => {
              const open = expanded.has(coll.id);
              const rootDrop = dropTargetKey(coll.id, '');
              return (
                <div key={coll.id} className="admin-notion-collection">
                  <div
                    className={`admin-notion-coll-head ${selected?.collectionId === coll.id && selected.kind === 'collection' ? 'is-selected' : ''} ${dragOver === rootDrop ? 'is-drop' : ''}`}
                    onDragOver={(e) => {
                      if (!coll.writable) return;
                      e.preventDefault();
                      setDragOver(rootDrop);
                    }}
                    onDragLeave={() => setDragOver((k) => (k === rootDrop ? null : k))}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(null);
                      const from = e.dataTransfer.getData('text/plain');
                      if (from) void onDropMove(coll.id, '', from);
                    }}
                  >
                    <button
                      type="button"
                      className="admin-notion-row-main"
                      onClick={() => {
                        toggleExpand(coll.id);
                        setSelected({ kind: 'collection', collectionId: coll.id });
                      }}
                    >
                      <span className="admin-ws-tree-caret">{open ? '▾' : '▸'}</span>
                      <strong>
                        {coll.label}
                        {coll.writable ? '' : ' 🔒'}
                      </strong>
                    </button>
                    <span className="muted admin-notion-coll-count">{coll.file_count}</span>
                  </div>
                  {open ? coll.children.map((node) => renderNode(coll, node, 1)) : null}
                </div>
              );
            })
          )}
          {tree?.orphans?.length ? (
            <div className="admin-notion-orphans">
              <div className="admin-notion-orphans-head">
                <p className="admin-notion-group-label">孤儿文档（仅库）</p>
                <button
                  type="button"
                  className="font-pill admin-notion-orphan-purge"
                  disabled={busy}
                  onClick={() => void onPurgeOrphans()}
                >
                  一键删除
                </button>
              </div>
              {tree.orphans.slice(0, 20).map((o) => (
                <div key={o.id} className="admin-notion-row is-file" style={{ paddingLeft: 22 }}>
                  <StatusDot status="orphan" />
                  <span className="admin-ws-tree-name">{o.title}</span>
                </div>
              ))}
              {tree.orphans.length > 20 ? (
                <p className="muted" style={{ fontSize: 12, padding: '4px 8px' }}>
                  另有 {tree.orphans.length - 20} 条未展开，一键删除会全部清除
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="admin-notion-side-actions">
          <button type="button" className="font-pill" disabled={busy} onClick={() => void onCreateFile()}>
            + 新建页面
          </button>
          <button type="button" className="font-pill" disabled={busy} onClick={() => void onMkdir()}>
            + 文件夹
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
          <button type="button" className="font-pill" disabled={busy} onClick={() => uploadRef.current?.click()}>
            上传
          </button>
          {batchSelected.size > 0 ? (
            <button type="button" className="btn" disabled={busy} onClick={() => void onBatchIndex()}>
              批量索引 {batchSelected.size}
            </button>
          ) : null}
        </div>
      </aside>

      <section className="admin-notion-page">
        <div className="admin-notion-page-toolbar">
          <div className="admin-notion-status-pills">
            <span className={`pill ${status?.rag_ready ? 'pill-active' : ''}`}>
              RAG {status?.rag_ready ? '就绪' : '未就绪'}
            </span>
            <span className="muted" style={{ fontSize: 12 }}>
              已索引 {summary?.indexed ?? 0} · 块 {summary?.db_chunks ?? 0}
            </span>
          </div>
          <div className="admin-notion-toolbar-right">
            <button type="button" className="font-pill" disabled={busy} onClick={() => void reload()}>
              刷新
            </button>
            <div className="admin-notion-menu-wrap" ref={menuRef}>
              <button type="button" className="font-pill" onClick={() => setMenuOpen((v) => !v)}>
                ···
              </button>
              {menuOpen ? (
                <div className="admin-notion-menu">
                  <button type="button" disabled={busy} onClick={() => void onRename()}>重命名</button>
                  <button type="button" disabled={busy} onClick={() => void onMove()}>移动到…</button>
                  <button type="button" disabled={busy} onClick={() => void onDelete()}>删除</button>
                  <hr />
                  <button
                    type="button"
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
                    disabled={busy}
                    onClick={() =>
                      void run('索引集合', async () => {
                        const r = await indexRagCollections(false, () => {
                          setMsg('索引集合任务进行中…');
                        });
                        return `已索引分组 ${r.indexed_groups ?? 0}`;
                      })
                    }
                  >
                    索引集合
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run('索引待处理', async () => {
                        const r = await indexPendingDisk(undefined, 8, () => {
                          setMsg('待处理索引任务进行中…');
                        });
                        return `处理 ${r.processed ?? 0} · 成功 ${r.indexed ?? 0}`;
                      })
                    }
                  >
                    索引待处理
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {err ? <p className="admin-rag-error-text">{err}</p> : null}
        {msg ? <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>{msg}</p> : null}

        {!file || selected?.kind !== 'file' ? (
          <div className="admin-notion-empty">
            <h2>选择左侧页面开始</h2>
            <p className="muted">
              公版目录只读 🔒；中文自有 / 手工 / 上传可编辑。可拖拽文件到文件夹移动。
            </p>
          </div>
        ) : (
          <>
            <header className="admin-notion-doc-head">
              <input
                className="admin-notion-title"
                value={file.title}
                readOnly
                title="标题来自文件名 / 库记录"
              />
              <div className="admin-notion-props">
                <span className={`admin-rag-status-badge admin-rag-status-${file.inventory_status}`}>
                  {file.inventory_label}
                </span>
                {file.content_stale ? (
                  <span className="admin-rag-status-badge admin-rag-status-pending">内容待重索引</span>
                ) : null}
                <span className="admin-notion-prop">{file.collection_id}</span>
                <span className="admin-notion-prop">{file.path}</span>
                <span className="admin-notion-prop">{file.chunks || chunkTotal || 0} chunks</span>
                <span className="admin-notion-prop">
                  {file.rag_index_at?.slice(0, 19).replace('T', ' ') || '未索引'}
                </span>
              </div>
              <div className="admin-notion-doc-actions">
                {file.writable ? (
                  <>
                    <div className="admin-notion-mode">
                      {(['split', 'edit', 'preview'] as DetailMode[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          className={mode === m ? 'is-active' : ''}
                          onClick={() => setMode(m)}
                        >
                          {m === 'split' ? '分屏' : m === 'edit' ? '编辑' : '预览'}
                        </button>
                      ))}
                    </div>
                    <button type="button" className="btn" disabled={busy || !dirty} onClick={() => void onSave()}>
                      {dirty ? '保存 *' : '已保存'}
                    </button>
                  </>
                ) : null}
                <button type="button" className="font-pill" disabled={busy} onClick={() => void onIndex()}>
                  {file.document_id ? '重新索引' : '索引入库'}
                </button>
                <button
                  type="button"
                  className="font-pill"
                  onClick={() => setShowChunks((v) => !v)}
                >
                  Chunks ({chunkTotal || file.chunks || 0})
                </button>
              </div>
              {file.rag_index_error ? (
                <p className="admin-rag-error-text">错误：{file.rag_index_error}</p>
              ) : null}
            </header>

            <div className={`admin-notion-body ${file.writable && mode === 'split' ? 'is-split' : ''}`}>
              {file.writable && (mode === 'edit' || mode === 'split') ? (
                <textarea
                  className="admin-notion-editor"
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    setDirty(e.target.value !== file.content);
                  }}
                  spellCheck={false}
                />
              ) : null}
              {(!file.writable || mode === 'preview' || mode === 'split') ? (
                <div className="admin-notion-preview">
                  <ReactMarkdown>{(file.writable ? draft : file.content).slice(0, 40000)}</ReactMarkdown>
                </div>
              ) : null}
            </div>

            {showChunks ? (
              <aside className="admin-notion-chunks">
                <div className="section-row" style={{ marginTop: 0 }}>
                  <strong>向量块</strong>
                  <button type="button" className="text-link" onClick={() => setShowChunks(false)}>
                    收起
                  </button>
                </div>
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
              </aside>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
