'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Props = {
  url: string;
  title: string;
  pageIndex: number;
  onPageCount?: (count: number) => void;
  onTap?: () => void;
  fullscreen?: boolean;
  onExitFullscreen?: () => void;
};

/** actual = PDF 100%（1pt≈1px）；page = 适页缩放进视口 */
type ViewMode = 'actual' | 'page';

function computePdfLayout(
  containerWidth: number,
  containerHeight: number,
  pageWidth: number,
  pageHeight: number,
  viewMode: ViewMode,
  userZoom: number,
) {
  const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 2 : 2, 2.5);
  const fitW = containerWidth / pageWidth;
  const fitH = containerHeight / pageHeight;
  const fitPage = Math.min(fitW, fitH);
  const base = viewMode === 'page' ? fitPage : 1;
  const scale = base * userZoom;
  return {
    dpr,
    renderScale: scale * dpr,
    cssWidth: pageWidth * scale,
    cssHeight: pageHeight * scale,
    effectiveScale: scale,
  };
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;

export default function ShelfPdfPager({
  url,
  title,
  pageIndex,
  onPageCount,
  onTap,
  fullscreen = false,
  onExitFullscreen,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<import('pdfjs-dist').PDFDocumentProxy | null>(null);
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback' | 'error'>('loading');
  const [pageCount, setPageCount] = useState(0);
  const [layoutTick, setLayoutTick] = useState(0);
  /** 相对当前 viewMode 的缩放；1 = 100% 原始尺寸（actual 模式） */
  const [userZoom, setUserZoom] = useState(1);
  /** 默认 100% 原始尺寸，非贴宽/适页 */
  const [viewMode, setViewMode] = useState<ViewMode>('actual');

  useEffect(() => {
    setUserZoom(1);
    setViewMode('actual');
  }, [pageIndex, url]);

  useEffect(() => {
    if (!fullscreen) {
      setUserZoom(1);
      setViewMode('actual');
    }
  }, [fullscreen]);

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
      const stage = stageRef.current;
      const canvas = canvasRef.current;
      if (!pdf || !host || !canvas) return;
      try {
        const page = await pdf.getPage(pageNum);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const w = host.clientWidth || Math.min(window.innerWidth - 24, 720);
        const h =
          stage?.clientHeight
          || host.clientHeight
          || Math.min(window.innerHeight - 160, 900);
        const { dpr, renderScale, cssWidth, cssHeight } = computePdfLayout(
          w,
          h,
          base.width,
          base.height,
          viewMode,
          userZoom,
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
  }, [status, pageIndex, pageCount, viewMode, userZoom, layoutTick]);

  useEffect(() => {
    stageRef.current?.scrollTo({ top: 0, left: 0 });
  }, [pageIndex, viewMode, userZoom]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (status !== 'ready' || !pdfRef.current) return;
      setLayoutTick((n) => n + 1);
    });
    ro.observe(host);
    if (stageRef.current) ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, [status]);

  const resetToActual = useCallback(() => {
    setViewMode('actual');
    setUserZoom(1);
  }, []);

  const resetToFitPage = useCallback(() => {
    setViewMode('page');
    setUserZoom(1);
  }, []);

  const bumpZoom = useCallback((delta: number) => {
    setUserZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + delta) * 100) / 100)));
  }, []);

  const onStageTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 2) {
      pinchRef.current = null;
      return;
    }
    const [a, b] = [e.touches[0], e.touches[1]];
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    pinchRef.current = { dist, zoom: userZoom };
  }, [userZoom]);

  const onStageTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 2 || !pinchRef.current) return;
    e.preventDefault();
    const [a, b] = [e.touches[0], e.touches[1]];
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (pinchRef.current.dist <= 0) return;
    const ratio = dist / pinchRef.current.dist;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinchRef.current.zoom * ratio));
    setUserZoom(Math.round(next * 100) / 100);
  }, []);

  const onStageTouchEnd = useCallback(() => {
    pinchRef.current = null;
  }, []);

  if (status === 'error') {
    return <p className="muted shelf-pdf-status">无法加载 PDF</p>;
  }

  const zoomLabel =
    viewMode === 'actual'
      ? `${Math.round(userZoom * 100)}%`
      : `${Math.round(userZoom * 100)}%·适页`;

  const zoomToolbar = (compact?: boolean) => (
    <>
      <button
        type="button"
        className="shelf-pdf-toolbar-btn"
        aria-label="缩小"
        onClick={(e) => {
          e.stopPropagation();
          bumpZoom(-0.15);
        }}
      >
        −
      </button>
      <span className="shelf-pdf-zoom-label">{zoomLabel}</span>
      <button
        type="button"
        className="shelf-pdf-toolbar-btn"
        aria-label="放大"
        onClick={(e) => {
          e.stopPropagation();
          bumpZoom(0.15);
        }}
      >
        +
      </button>
      {!compact ? (
        <>
          <button
            type="button"
            className={`shelf-pdf-toolbar-btn${viewMode === 'actual' ? ' is-active' : ''}`}
            aria-label="100% 原始尺寸"
            onClick={(e) => {
              e.stopPropagation();
              resetToActual();
            }}
          >
            100%
          </button>
          <button
            type="button"
            className={`shelf-pdf-toolbar-btn${viewMode === 'page' ? ' is-active' : ''}`}
            aria-label="适页"
            onClick={(e) => {
              e.stopPropagation();
              resetToFitPage();
            }}
          >
            适页
          </button>
        </>
      ) : (
        <button
          type="button"
          className={`shelf-pdf-toolbar-btn${viewMode === 'actual' ? ' is-active' : ''}`}
          aria-label="100% 原始尺寸"
          onClick={(e) => {
            e.stopPropagation();
            resetToActual();
          }}
        >
          100%
        </button>
      )}
    </>
  );

  return (
    <div
      className={`shelf-pdf-pager${fullscreen ? ' is-fullscreen' : ''}`}
      onClick={fullscreen ? undefined : onTap}
    >
      {fullscreen && onExitFullscreen ? (
        <div className="shelf-pdf-fullscreen-head">
          <button
            type="button"
            className="shelf-pdf-toolbar-btn shelf-pdf-exit-btn"
            aria-label="退出全屏"
            onClick={(e) => {
              e.stopPropagation();
              onExitFullscreen();
            }}
          >
            ✕ 退出
          </button>
          <div className="shelf-pdf-zoom-controls">{zoomToolbar()}</div>
        </div>
      ) : null}

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

      <div ref={hostRef} className="shelf-pdf-pager-host">
        <div
          ref={stageRef}
          className="shelf-pdf-pager-stage"
          aria-busy={status === 'loading'}
          onTouchStart={onStageTouchStart}
          onTouchMove={onStageTouchMove}
          onTouchEnd={onStageTouchEnd}
          onTouchCancel={onStageTouchEnd}
        >
          <div className="shelf-pdf-page-wrap">
            <canvas
              ref={canvasRef}
              className="shelf-pdf-page-canvas"
              role="img"
              aria-label={`${title} 第 ${pageIndex + 1} 页`}
            />
          </div>
        </div>
      </div>

      {!fullscreen ? (
        <div className="shelf-pdf-inline-tools">{zoomToolbar(true)}</div>
      ) : null}
    </div>
  );
}
