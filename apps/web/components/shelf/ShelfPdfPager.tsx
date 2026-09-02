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

/** actual = PDF 100%（1pt≈1px）；page = 适页缩放进视口；width = 贴宽 */
type ViewMode = 'actual' | 'page' | 'width';

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
  const base =
    viewMode === 'page' ? fitPage : viewMode === 'width' ? fitW : 1;
  const scale = base * userZoom;
  return {
    dpr,
    renderScale: scale * dpr,
    cssWidth: pageWidth * scale,
    cssHeight: pageHeight * scale,
    effectiveScale: scale,
    overflows: pageHeight * scale > containerHeight + 2 || pageWidth * scale > containerWidth + 2,
  };
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const RESIZE_DEBOUNCE_MS = 180;
const PDF_PAGE_CACHE_MAX = 48;
const pdfPageCache = new Map<string, ImageBitmap>();

function pdfCacheKey(
  url: string,
  pageNum: number,
  viewMode: ViewMode,
  userZoom: number,
  w: number,
  h: number,
) {
  return `${url}|${pageNum}|${viewMode}|${userZoom}|${Math.round(w)}x${Math.round(h)}`;
}

function trimPdfCache() {
  while (pdfPageCache.size > PDF_PAGE_CACHE_MAX) {
    const first = pdfPageCache.keys().next().value;
    if (!first) break;
    const bmp = pdfPageCache.get(first);
    bmp?.close?.();
    pdfPageCache.delete(first);
  }
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
  const stageRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<import('pdfjs-dist').PDFDocumentProxy | null>(null);
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback' | 'error'>('loading');
  const [pageCount, setPageCount] = useState(0);
  const [layoutTick, setLayoutTick] = useState(0);
  const [userZoom, setUserZoom] = useState(1);
  /** 默认适页：整页可见、字号可读 */
  const [viewMode, setViewMode] = useState<ViewMode>('page');

  useEffect(() => {
    setUserZoom(1);
    setViewMode(fullscreen ? 'page' : 'page');
  }, [pageIndex, url, fullscreen]);

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
        const { dpr, renderScale, cssWidth, cssHeight, overflows } = computePdfLayout(
          w,
          h,
          base.width,
          base.height,
          viewMode,
          userZoom,
        );
        stage?.classList.toggle('is-scrollable', overflows);
        const scaled = page.getViewport({ scale: renderScale });
        canvas.width = scaled.width;
        canvas.height = scaled.height;
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const cacheKey = pdfCacheKey(url, pageNum, viewMode, userZoom, w, h);
        const cached = pdfPageCache.get(cacheKey);
        if (cached) {
          canvas.width = cached.width;
          canvas.height = cached.height;
          ctx.drawImage(cached, 0, 0);
          return;
        }
        await page.render({ canvasContext: ctx, viewport: scaled }).promise;
        if (cancelled) return;
        try {
          const bitmap = await createImageBitmap(canvas);
          pdfPageCache.set(cacheKey, bitmap);
          trimPdfCache();
        } catch {
          /* ignore cache errors */
        }
      } catch {
        /* ignore render errors */
      }
    };
    void render();
    return () => {
      cancelled = true;
    };
  }, [status, pageIndex, pageCount, viewMode, userZoom, layoutTick, url]);

  useEffect(() => {
    stageRef.current?.scrollTo({ top: 0, left: 0 });
  }, [pageIndex, viewMode]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === 'undefined') return;
    const schedule = () => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = setTimeout(() => {
        if (status !== 'ready' || !pdfRef.current) return;
        setLayoutTick((n) => n + 1);
      }, RESIZE_DEBOUNCE_MS);
    };
    const ro = new ResizeObserver(schedule);
    ro.observe(host);
    return () => {
      ro.disconnect();
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
    };
  }, [status]);

  const resetToFitPage = useCallback(() => {
    setViewMode('page');
    setUserZoom(1);
  }, []);

  const resetToFitWidth = useCallback(() => {
    setViewMode('width');
    setUserZoom(1);
  }, []);

  const resetToActual = useCallback(() => {
    setViewMode('actual');
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
      : viewMode === 'width'
        ? `${Math.round(userZoom * 100)}%·贴宽`
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
            className={`shelf-pdf-toolbar-btn${viewMode === 'page' ? ' is-active' : ''}`}
            aria-label="适页"
            onClick={(e) => {
              e.stopPropagation();
              resetToFitPage();
            }}
          >
            适页
          </button>
          <button
            type="button"
            className={`shelf-pdf-toolbar-btn${viewMode === 'width' ? ' is-active' : ''}`}
            aria-label="贴宽"
            onClick={(e) => {
              e.stopPropagation();
              resetToFitWidth();
            }}
          >
            贴宽
          </button>
        </>
      ) : (
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
