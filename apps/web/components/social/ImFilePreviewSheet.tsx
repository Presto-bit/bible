'use client';

import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import AppBodyPortal from '@/components/AppBodyPortal';
import { api } from '@/lib/api';
import { downloadImAsset } from '@/lib/im_media';
import {
  detectFilePreviewMode,
  fetchTextPreview,
  openInSystemBrowser,
  parseCsvRows,
  type ImFilePreviewMode,
} from '@/lib/im_file_preview';

type Props = {
  url: string;
  fileName?: string | null;
  mime?: string | null;
  storageKey?: string | null;
  onClose: () => void;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'pdf'; src: string; revoke?: boolean }
  | { status: 'html'; html: string }
  | { status: 'text'; text: string }
  | { status: 'markdown'; text: string }
  | { status: 'csv'; rows: string[][] }
  | { status: 'download' };

async function loadDocxHtml(url: string): Promise<string> {
  const mammoth = await import('mammoth');
  const res = await fetch(url);
  if (!res.ok) throw new Error('文件加载失败');
  const buf = await res.arrayBuffer();
  const out = await mammoth.convertToHtml({ arrayBuffer: buf });
  return out.value || '<p class="muted">（空文档）</p>';
}

async function loadSheetHtml(url: string): Promise<string> {
  const XLSX = await import('xlsx');
  const res = await fetch(url);
  if (!res.ok) throw new Error('文件加载失败');
  const buf = await res.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const name = wb.SheetNames[0];
  if (!name) return '<p class="muted">（空表格）</p>';
  return XLSX.utils.sheet_to_html(wb.Sheets[name]!, { id: 'im-sheet-preview' });
}

/** 群聊/私信附件预览：PDF / 文本 / Office / 下载。 */
export function ImFilePreviewSheet({
  url,
  fileName,
  mime,
  storageKey,
  onClose,
}: Props) {
  const label = fileName || '附件';
  const mode: ImFilePreviewMode = useMemo(
    () => detectFilePreviewMode(mime, fileName),
    [mime, fileName],
  );
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let revokeUrl: string | undefined;

    const fail = (message: string) => {
      if (!cancelled) setState({ status: 'error', message });
    };

    const run = async () => {
      setState({ status: 'loading' });
      try {
        if (mode === 'pdf') {
          if (!cancelled) setState({ status: 'pdf', src: url });
          return;
        }
        if (mode === 'text') {
          const text = await fetchTextPreview(url);
          if (!cancelled) setState({ status: 'text', text });
          return;
        }
        if (mode === 'markdown') {
          const text = await fetchTextPreview(url);
          if (!cancelled) setState({ status: 'markdown', text });
          return;
        }
        if (mode === 'csv') {
          const text = await fetchTextPreview(url);
          if (!cancelled) setState({ status: 'csv', rows: parseCsvRows(text) });
          return;
        }
        if (mode === 'docx') {
          const html = await loadDocxHtml(url);
          if (!cancelled) setState({ status: 'html', html });
          return;
        }
        if (mode === 'sheet') {
          const html = await loadSheetHtml(url);
          if (!cancelled) setState({ status: 'html', html });
          return;
        }
        if (mode === 'server-pdf') {
          if (!storageKey) throw new Error('无法预览：缺少附件标识');
          const blob = await api.previewSocialMedia(storageKey);
          revokeUrl = URL.createObjectURL(blob);
          if (!cancelled) setState({ status: 'pdf', src: revokeUrl, revoke: true });
          return;
        }
        if (!cancelled) setState({ status: 'download' });
      } catch (e) {
        fail(e instanceof Error ? e.message : '预览失败');
      }
    };

    void run();
    return () => {
      cancelled = true;
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
    };
  }, [url, mode, storageKey]);

  const footer = (
    <div className="im-file-preview-foot">
      <button
        type="button"
        className="font-pill"
        onClick={() => void downloadImAsset(url, fileName)}
      >
        下载
      </button>
      <button type="button" className="font-pill" onClick={() => openInSystemBrowser(url)}>
        在浏览器打开
      </button>
    </div>
  );

  return (
    <AppBodyPortal>
      <div className="im-file-preview" role="dialog" aria-modal="true" aria-label="文件预览">
        <button type="button" className="im-file-preview-backdrop" aria-label="关闭" onClick={onClose} />
        <div className="im-file-preview-panel card">
          <div className="im-file-preview-head">
            <strong className="im-file-preview-name">{label}</strong>
            <button type="button" className="text-link" onClick={onClose}>
              关闭
            </button>
          </div>

          <div className="im-file-preview-body">
            {state.status === 'loading' ? <p className="muted">加载预览…</p> : null}
            {state.status === 'error' ? (
              <div className="im-file-preview-fallback">
                <p>{state.message}</p>
                {footer}
              </div>
            ) : null}
            {state.status === 'pdf' ? (
              <iframe className="im-file-preview-frame" src={state.src} title={label} />
            ) : null}
            {state.status === 'text' ? (
              <pre className="im-file-preview-text">{state.text}</pre>
            ) : null}
            {state.status === 'markdown' ? (
              <div className="im-file-preview-md prose">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{state.text}</ReactMarkdown>
              </div>
            ) : null}
            {state.status === 'csv' ? (
              <div className="im-file-preview-table-wrap">
                <table className="im-file-preview-table">
                  <tbody>
                    {state.rows.map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cell, ci) => (
                          <td key={ci}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {state.status === 'html' ? (
              <div
                className="im-file-preview-html"
                dangerouslySetInnerHTML={{ __html: state.html }}
              />
            ) : null}
            {state.status === 'download' ? (
              <div className="im-file-preview-fallback">
                <p className="muted">此类型暂不支持在线预览</p>
                {footer}
              </div>
            ) : null}
          </div>

          {state.status !== 'error' && state.status !== 'download' && state.status !== 'loading' ? (
            footer
          ) : null}
        </div>
      </div>
    </AppBodyPortal>
  );
}
