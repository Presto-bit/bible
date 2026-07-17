'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  previewKnowledgeDocument,
  type KnowledgeDocumentPreview,
} from '@/lib/api';

type Props = {
  documentId: string;
  onClose: () => void;
};

/** 知识库文件预览（对齐管理端 RAG chunk 预览） */
export function KnowledgeDocPreviewSheet({ documentId, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<KnowledgeDocumentPreview | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr('');
    setData(null);
    void previewKnowledgeDocument(documentId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : '预览失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  if (!mounted) return null;

  return createPortal(
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="sheet card"
        style={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="资料预览"
      >
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong style={{ flex: 1, minWidth: 0 }}>
            {data?.title || (loading ? '加载中…' : '资料预览')}
          </strong>
          <button type="button" className="text-link" onClick={onClose}>
            关闭
          </button>
        </div>
        {data && (
          <p className="muted" style={{ margin: '0 0 10px', fontSize: 12 }}>
            {data.source_type}
            {data.total_chunks != null ? ` · ${data.total_chunks} 块` : ''}
          </p>
        )}
        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {loading && <p className="muted">正在加载预览…</p>}
          {err && <p className="muted">{err}</p>}
          {data && !data.chunks.length && (
            <p className="muted">暂无索引片段（可能尚未入库向量）。</p>
          )}
          {data?.chunks.map((c) => (
            <div
              key={c.index}
              style={{
                padding: '10px 0',
                borderTop: '1px solid var(--line)',
              }}
            >
              <span className="muted" style={{ fontSize: 11 }}>
                #{c.index}
                {c.length ? ` · ${c.length} 字` : ''}
              </span>
              <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {c.preview}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
