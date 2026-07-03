'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  adminLogin,
  clearAdminToken,
  deleteRagDocument,
  fetchRagDocuments,
  fetchRagStatus,
  reindexRagDocument,
  uploadRagDocument,
  type RagDocument,
  type RagStatus,
} from '@/lib/admin_rag';

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`pill ${ok ? 'pill-active' : ''}`} style={{ fontSize: 11 }}>
      {label} {ok ? '✓' : '✗'}
    </span>
  );
}

export default function AdminRagPanel({ onLogout }: { onLogout?: () => void }) {
  const [status, setStatus] = useState<RagStatus | null>(null);
  const [docs, setDocs] = useState<RagDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState('');
  const [bookId, setBookId] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [st, list] = await Promise.all([fetchRagStatus(), fetchRagDocuments()]);
      setStatus(st);
      setDocs(list);
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

  return (
    <div className="admin-rag-panel">
      <div className="section-row" style={{ marginTop: 0 }}>
        <p className="settings-title" style={{ margin: 0 }}>RAG 资料管理</p>
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
            文档 {status.documents} 篇 · 向量块 {status.chunks} 个
          </p>
          {!status.rag_ready ? (
            <p className="muted" style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.5 }}>
              RAG 未就绪：需配置 Embedding Key、上传注释资料并完成索引。小爱问答将降级为无脚注模式。
            </p>
          ) : null}
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
          <p className="settings-title" style={{ margin: 0 }}>已入库资料</p>
          <button type="button" className="text-link" disabled={busy} onClick={() => void refresh()}>
            刷新
          </button>
        </div>
        {docs.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>暂无资料，请上传 Markdown 注释。</p>
        ) : (
          <div className="admin-rag-doc-list">
            {docs.map((d) => (
              <div key={d.id} className="card card-2 admin-rag-doc-item">
                <strong style={{ fontSize: 14 }}>{d.title}</strong>
                <p className="muted" style={{ margin: '4px 0', fontSize: 12 }}>
                  {d.chunks} 块 · {d.status}
                  {d.rag_index_at ? ` · ${new Date(d.rag_index_at).toLocaleString()}` : ''}
                </p>
                {d.rag_index_error ? (
                  <p className="muted" style={{ margin: 0, fontSize: 11, color: 'var(--danger, #c45c4a)' }}>
                    {d.rag_index_error}
                  </p>
                ) : null}
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
        )}
      </div>

      {err ? <p className="muted" style={{ marginTop: 8, fontSize: 12, color: 'var(--danger, #c45c4a)' }}>{err}</p> : null}
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
      {err ? <p className="muted" style={{ marginTop: 8, fontSize: 12, color: 'var(--danger, #c45c4a)' }}>{err}</p> : null}
    </div>
  );
}
