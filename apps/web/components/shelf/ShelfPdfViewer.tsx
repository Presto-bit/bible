'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  url: string;
  title: string;
};

export default function ShelfPdfViewer({ url, title }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback' | 'error'>('loading');
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;

    const run = async () => {
      setStatus('loading');
      host.innerHTML = '';
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

        const task = pdfjs.getDocument({ url, withCredentials: false });
        const pdf = await task.promise;
        if (cancelled) return;

        setPageCount(pdf.numPages);
        const containerWidth = host.clientWidth || window.innerWidth;

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
          if (cancelled) return;
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 1 });
          const scale = Math.min(2, Math.max(0.5, containerWidth / viewport.width));
          const scaled = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          canvas.className = 'shelf-pdf-page-canvas';
          canvas.width = scaled.width;
          canvas.height = scaled.height;
          canvas.setAttribute('role', 'img');
          canvas.setAttribute('aria-label', `${title} 第 ${pageNum} 页`);

          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport: scaled }).promise;

          const wrap = document.createElement('div');
          wrap.className = 'shelf-pdf-page';
          const label = document.createElement('span');
          label.className = 'shelf-pdf-page-num';
          label.textContent = `${pageNum} / ${pdf.numPages}`;
          wrap.appendChild(canvas);
          wrap.appendChild(label);
          host.appendChild(wrap);
        }

        if (!cancelled) setStatus('ready');
      } catch {
        if (!cancelled) setStatus('fallback');
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [url, title]);

  if (status === 'error') {
    return <p className="muted shelf-pdf-status">无法加载 PDF</p>;
  }

  return (
    <div className="shelf-pdf-viewer">
      {status === 'loading' ? <p className="muted shelf-pdf-status">正在排版 PDF…</p> : null}
      {status === 'fallback' ? (
        <div className="shelf-pdf-fallback">
          <p className="muted">本机预览失败，可尝试系统阅读器打开。</p>
          <a className="shelf-pdf-open-link" href={url} target="_blank" rel="noopener noreferrer">
            打开 PDF
          </a>
          <iframe title={title} className="shelf-lesson-pdf shelf-pdf-fallback-frame" src={url} />
        </div>
      ) : null}
      <div ref={hostRef} className="shelf-pdf-pages" aria-busy={status === 'loading'} />
      {status === 'ready' && pageCount > 0 ? (
        <p className="shelf-pdf-foot muted">共 {pageCount} 页 · 可上下滑动阅读</p>
      ) : null}
    </div>
  );
}
