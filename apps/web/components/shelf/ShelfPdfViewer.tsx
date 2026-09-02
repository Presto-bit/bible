'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  url: string;
  title: string;
};

function computePdfScale(containerWidth: number, pageWidth: number) {
  const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 2 : 2, 2.5);
  const fit = containerWidth / pageWidth;
  return { dpr, renderScale: fit * dpr, cssWidth: containerWidth };
}

export default function ShelfPdfViewer({ url, title }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<import('pdfjs-dist').PDFDocumentProxy | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback' | 'error'>('loading');
  const [pageCount, setPageCount] = useState(0);
  const [loadedPages, setLoadedPages] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;

    const rendered = new Set<number>();

    const renderPage = async (pageNum: number) => {
      if (cancelled || rendered.has(pageNum) || !pdfRef.current || !host) return;
      rendered.add(pageNum);
      const pdf = pdfRef.current;
      const page = await pdf.getPage(pageNum);
      const baseViewport = page.getViewport({ scale: 1 });
      const containerWidth = host.clientWidth || Math.min(window.innerWidth - 36, 720);
      const { dpr, renderScale, cssWidth } = computePdfScale(containerWidth, baseViewport.width);
      const scaled = page.getViewport({ scale: renderScale });

      const canvas = document.createElement('canvas');
      canvas.className = 'shelf-pdf-page-canvas';
      canvas.dataset.page = String(pageNum);
      canvas.width = scaled.width;
      canvas.height = scaled.height;
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${scaled.height / dpr}px`;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `${title} 第 ${pageNum} 页`);

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      await page.render({ canvasContext: ctx, viewport: scaled }).promise;

      const wrap = document.createElement('div');
      wrap.className = 'shelf-pdf-page';
      wrap.dataset.page = String(pageNum);
      const label = document.createElement('span');
      label.className = 'shelf-pdf-page-num';
      label.textContent = `${pageNum} / ${pdf.numPages}`;
      wrap.appendChild(canvas);
      wrap.appendChild(label);

      const existing = host.querySelector(`.shelf-pdf-page[data-page="${pageNum}"]`);
      if (existing) existing.replaceWith(wrap);
      else host.appendChild(wrap);

      if (!cancelled) {
        setLoadedPages((n) => Math.max(n, pageNum));
        if (pageNum === 1) setStatus('ready');
      }
    };

    const observeLazyPages = () => {
      if (!host || typeof IntersectionObserver === 'undefined') return null;
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const pageNum = Number((entry.target as HTMLElement).dataset.page);
            if (pageNum > 0) void renderPage(pageNum);
          }
        },
        { root: null, rootMargin: '240px 0px', threshold: 0.01 },
      );
      for (let i = 1; i <= (pdfRef.current?.numPages ?? 0); i += 1) {
        if (i === 1) continue;
        const placeholder = document.createElement('div');
        placeholder.className = 'shelf-pdf-page shelf-pdf-page-placeholder';
        placeholder.dataset.page = String(i);
        placeholder.style.minHeight = '320px';
        host.appendChild(placeholder);
        io.observe(placeholder);
      }
      return io;
    };

    const run = async () => {
      setStatus('loading');
      setLoadedPages(0);
      host.innerHTML = '';
      pdfRef.current = null;
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();

        const pdf = await pdfjs.getDocument({ url, withCredentials: false }).promise;
        if (cancelled) return;
        pdfRef.current = pdf;
        setPageCount(pdf.numPages);

        await renderPage(1);
        observeLazyPages();
        if (!cancelled) setStatus('ready');
      } catch {
        if (!cancelled) setStatus('fallback');
      }
    };

    void run();
    return () => {
      cancelled = true;
      pdfRef.current = null;
    };
  }, [url, title]);

  if (status === 'error') {
    return <p className="muted shelf-pdf-status">无法加载 PDF</p>;
  }

  return (
    <div className="shelf-pdf-viewer">
      {status === 'loading' ? (
        <p className="muted shelf-pdf-status" role="status">
          正在加载 PDF…{loadedPages > 0 ? `（${loadedPages}/${pageCount || '…'} 页）` : ''}
        </p>
      ) : null}
      {status === 'fallback' ? (
        <div className="shelf-pdf-fallback">
          <p className="muted">本机预览失败，可尝试系统阅读器打开。</p>
          <a className="shelf-pdf-open-link" href={url} target="_blank" rel="noopener noreferrer">
            打开 PDF
          </a>
        </div>
      ) : null}
      <div ref={hostRef} className="shelf-pdf-pages" aria-busy={status === 'loading'} />
      {status === 'ready' && pageCount > 0 ? (
        <p className="shelf-pdf-foot muted">共 {pageCount} 页 · 可上下滑动阅读</p>
      ) : null}
    </div>
  );
}
