'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  url: string;
  title: string;
  pageIndex: number;
  onPageCount?: (count: number) => void;
  onTap?: () => void;
  fullscreen?: boolean;
  onExitFullscreen?: () => void;
};

function computePdfScale(containerWidth: number, containerHeight: number, pageWidth: number, pageHeight: number) {
  const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 2 : 2, 2.5);
  const fitW = containerWidth / pageWidth;
  const fitH = containerHeight / pageHeight;
  const fit = Math.min(fitW, fitH);
  return { dpr, renderScale: fit * dpr, cssWidth: pageWidth * fit, cssHeight: pageHeight * fit };
}

export default function ShelfPdfPager({
  url,
  title,
  pageIndex,
  onPageCount,
  onTap,
  fullscreen = false,
  onExitFullscreen,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<import('pdfjs-dist').PDFDocumentProxy | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback' | 'error'>('loading');
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setStatus('loading');
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
        onPageCount?.(pdf.numPages);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('fallback');
      }
    };
    void run();
    return () => {
      cancelled = true;
      pdfRef.current = null;
    };
  }, [url, onPageCount]);

  useEffect(() => {
    if (status !== 'ready' || !pdfRef.current || !hostRef.current || !canvasRef.current) return;
    let cancelled = false;
    const pageNum = Math.min(pageCount, Math.max(1, pageIndex + 1));

    const render = async () => {
      const pdf = pdfRef.current;
      const host = hostRef.current;
      const canvas = canvasRef.current;
      if (!pdf || !host || !canvas) return;
      try {
        const page = await pdf.getPage(pageNum);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const w = host.clientWidth || Math.min(window.innerWidth - 32, 720);
        const h = host.clientHeight || Math.min(window.innerHeight - 160, 900);
        const { dpr, renderScale, cssWidth, cssHeight } = computePdfScale(
          w,
          h,
          base.width,
          base.height,
        );
        const scaled = page.getViewport({ scale: renderScale });
        canvas.width = scaled.width;
        canvas.height = scaled.height;
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        await page.render({ canvasContext: ctx, viewport: scaled }).promise;
      } catch {
        /* ignore render errors */
      }
    };
    void render();
    return () => {
      cancelled = true;
    };
  }, [status, pageIndex, pageCount]);

  if (status === 'error') {
    return <p className="muted shelf-pdf-status">无法加载 PDF</p>;
  }

  return (
    <div
      className={`shelf-pdf-pager${fullscreen ? ' is-fullscreen' : ''}`}
      onClick={onTap}
    >
      {status === 'loading' ? (
        <p className="muted shelf-pdf-status" role="status">
          正在加载 PDF…
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
      <div ref={hostRef} className="shelf-pdf-pager-stage" aria-busy={status === 'loading'}>
        <canvas
          ref={canvasRef}
          className="shelf-pdf-page-canvas"
          role="img"
          aria-label={`${title} 第 ${pageIndex + 1} 页`}
        />
      </div>
      {fullscreen && onExitFullscreen ? (
        <button
          type="button"
          className="shelf-pdf-toolbar-btn shelf-pdf-exit-fullscreen"
          aria-label="退出全屏"
          onClick={(e) => {
            e.stopPropagation();
            onExitFullscreen();
          }}
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}
