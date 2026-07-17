'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  previewKnowledgeDocument,
  type KnowledgeDocumentPreview,
} from '@/lib/api';

type Props = {
  documentId: string;
  onClose: () => void;
};

const RENDER_MAX = 80_000;

/** 知识库文件预览：展示源文件原文（Markdown） */
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

  const markdown = useMemo(() => {
    const raw = data?.content || '';
    if (raw.length <= RENDER_MAX) return raw;
    return raw.slice(0, RENDER_MAX);
  }, [data?.content]);

  const renderTruncated = Boolean(
    data?.content && data.content.length > RENDER_MAX,
  );

  if (!mounted) return null;

  const metaParts: string[] = [];
  if (data?.source_type) metaParts.push(data.source_type);
  if (data?.size_bytes != null) {
    const kb = Math.max(1, Math.round(data.size_bytes / 1024));
    metaParts.push(`${kb} KB`);
  }

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
        {data && metaParts.length > 0 && (
          <p className="muted" style={{ margin: '0 0 10px', fontSize: 12 }}>
            {metaParts.join(' · ')}
            {data.truncated ? ' · 文件过长，已截断传输' : ''}
          </p>
        )}
        <div
          style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}
          className="kb-doc-preview-body"
        >
          {loading && <p className="muted">正在加载原文…</p>}
          {err && <p className="muted">{err}</p>}
          {!loading && !err && data && !data.content.trim() && (
            <p className="muted">文件为空。</p>
          )}
          {!loading && !err && markdown.trim() && (
            <div style={{ fontSize: 15, lineHeight: 1.65 }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
              {(data?.truncated || renderTruncated) && (
                <p className="muted" style={{ marginTop: 16, fontSize: 12 }}>
                  正文过长，此处仅展示部分原文。
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
