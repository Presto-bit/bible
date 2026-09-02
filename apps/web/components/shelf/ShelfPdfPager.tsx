'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { clampShelfPdfZoom } from '@/lib/shelf_reader_contract';

type Props = {
  url: string;
  title: string;
  pageIndex: number;
  onPageCount?: (count: number) => void;
  onPageIndexChange?: (index: number) => void;
  onTap?: () => void;
  fullscreen?: boolean;
  onExitFullscreen?: () => void;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
  zoomMin?: number;
  zoomMax?: number;
  zoomStep?: number;
  onPinchActive?: (active: boolean) => void;
};

function computePdfLayout(
  containerWidth: number,
  pageWidth: number,
  pageHeight: number,
  fullscreen: boolean,
  zoom = 1,
) {
  const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 2 : 2, 2);
  const fitW = containerWidth / pageWidth;
  let scale = fitW * zoom;
  if (fullscreen && typeof window !== 'undefined') {
    const maxH = window.innerHeight - 72;
    const fitH = maxH / pageHeight;
    scale = Math.min(fitW, fitH) * zoom;
  }
  return {
    dpr,
    renderScale: scale * dpr,
    cssWidth: pageWidth * scale,
    cssHeight: pageHeight * scale,
  };
}

const RESIZE_DEBOUNCE_MS = 200;
const PDF_PAGE_CACHE_MAX = 48;
const pdfPageCache = new Map<string, ImageBitmap>();

function measurePdfContainerWidth(host: HTMLElement | null, fullscreen: boolean): number {
  if (fullscreen && typeof window !== 'undefined') {
    return Math.max(280, window.innerWidth - 24);
  }
  const fromHost = host?.getBoundingClientRect().width ?? host?.clientWidth ?? 0;
  if (fromHost > 0) return fromHost;
  const fromParent = host?.parentElement?.clientWidth ?? 0;
  if (fromParent > 0) return fromParent;
  if (typeof window !== 'undefined') {
    return Math.max(280, Math.min(window.innerWidth - 32, 720));
  }
  return 720;
}

function pdfCacheKey(url: string, pageNum: number, w: number, zoom: number) {
  return `${url}|${pageNum}|${Math.round(w)}|${Math.round(zoom * 100)}`;
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

function touchSpan(touches: TouchList): number {
  if (touches.length < 2) return 0;
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

function PdfPageTile({
  pdf,
  pageNum,
  url,
  containerWidth,
  title,
  fullscreen,
  zoom,
  scrollRootRef,
}: {
  pdf: import('pdfjs-dist').PDFDocumentProxy;
  pageNum: number;
  url: string;
  containerWidth: number;
  title: string;
  fullscreen: boolean;
  zoom: number;
  scrollRootRef: RefObject<HTMLElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(pageNum === 1);
  const [placeholderH, setPlaceholderH] = useState(480);
  const [renderError, setRenderError] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pageNum === 1) {
      setVisible(true);
      return;
    }
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true);
      },
      {
        root: scrollRootRef.current,
        rootMargin: fullscreen ? '120px 0px' : '320px 0px',
        threshold: 0.01,
      },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [pageNum, scrollRootRef, fullscreen]);

  useEffect(() => {
    if (!visible || !canvasRef.current || containerWidth <= 0) return;
    let cancelled = false;
    setRenderError(false);
    const render = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        const page = await pdf.getPage(pageNum);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const w = containerWidth;
        const { dpr, renderScale, cssWidth, cssHeight } = computePdfLayout(
          w,
          base.width,
          base.height,
          fullscreen,
          zoom,
        );
        setPlaceholderH(cssHeight);
        const scaled = page.getViewport({ scale: renderScale });
        const cacheKey = pdfCacheKey(url, pageNum, w, zoom);
        const cached = pdfPageCache.get(cacheKey);
        if (cached) {
          canvas.width = cached.width;
          canvas.height = cached.height;
          canvas.style.width = `${cssWidth}px`;
          canvas.style.height = `${cssHeight}px`;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(cached, 0, 0);
          return;
        }
        canvas.width = scaled.width;
        canvas.height = scaled.height;
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        await page.render({ canvasContext: ctx, viewport: scaled }).promise;
        if (cancelled) return;
        try {
          const bitmap = await createImageBitmap(canvas);
          pdfPageCache.set(cacheKey, bitmap);
          trimPdfCache();
        } catch {
          /* ignore */
        }
      } catch {
        if (!cancelled) setRenderError(true);
      }
    };
    void render();
    return () => {
      cancelled = true;
    };
  }, [visible, pdf, pageNum, url, containerWidth, fullscreen, zoom]);

  const zoomed = zoom > 1.001;

  return (
    <div ref={rootRef} className="shelf-pdf-scroll-page" style={{ minHeight: placeholderH }}>
      {renderError ? (
        <p className="muted shelf-pdf-status">本页渲染失败</p>
      ) : null}
      <canvas
        ref={canvasRef}
        className={`shelf-pdf-page-canvas${zoomed ? ' is-zoomed' : ''}`}
        role="img"
        aria-label={`${title} 第 ${pageNum} 页`}
      />
    </div>
  );
}

export default function ShelfPdfPager({
  url,
  title,
  pageIndex,
  onPageCount,
  onPageIndexChange,
  onTap,
  fullscreen = false,
  onExitFullscreen,
  zoom = 1,
  onZoomChange,
  zoomMin = 1,
  zoomMax = 2,
  onPinchActive,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<import('pdfjs-dist').PDFDocumentProxy | null>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activePageRef = useRef(pageIndex);
  const scrollSyncRef = useRef(false);
  const pageFromScrollRef = useRef(false);
  const scrollRafRef = useRef<number | null>(null);
  const suppressTapRef = useRef(false);
  const pinchRef = useRef({ active: false, startSpan: 0, startZoom: 1 });
  const zoomRafRef = useRef<number | null>(null);
  const pendingZoomRef = useRef<number | null>(null);
  const [pinching, setPinching] = useState(false);
  const zoomRef = useRef(zoom);
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback' | 'error'>('loading');
  const [pageCount, setPageCount] = useState(0);
  const [containerWidth, setContainerWidth] = useState(() => measurePdfContainerWidth(null, false));
  const [pdfDoc, setPdfDoc] = useState<import('pdfjs-dist').PDFDocumentProxy | null>(null);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const scheduleZoom = useCallback(
    (next: number) => {
      if (!onZoomChange) return;
      pendingZoomRef.current = clampShelfPdfZoom(next);
      if (zoomRafRef.current != null) return;
      zoomRafRef.current = window.requestAnimationFrame(() => {
        zoomRafRef.current = null;
        const z = pendingZoomRef.current;
        pendingZoomRef.current = null;
        if (z != null) onZoomChange(z);
      });
    },
    [onZoomChange],
  );

  useEffect(() => {
    activePageRef.current = pageIndex;
  }, [pageIndex]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el || !onZoomChange) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const span = touchSpan(e.touches);
      if (span <= 0) return;
      pinchRef.current = { active: true, startSpan: span, startZoom: zoomRef.current };
      onPinchActive?.(true);
      setPinching(true);
      suppressTapRef.current = true;
      e.preventDefault();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinchRef.current.active || e.touches.length !== 2) return;
      const span = touchSpan(e.touches);
      if (pinchRef.current.startSpan <= 0) return;
      e.preventDefault();
      const ratio = span / pinchRef.current.startSpan;
      scheduleZoom(pinchRef.current.startZoom * ratio);
    };
    const endPinch = (e: TouchEvent) => {
      if (!pinchRef.current.active) return;
      if (e.touches.length >= 2) return;
      pinchRef.current.active = false;
      onPinchActive?.(false);
      setPinching(false);
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', endPinch, { passive: true });
    el.addEventListener('touchcancel', endPinch, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', endPinch);
      el.removeEventListener('touchcancel', endPinch);
      if (zoomRafRef.current != null) window.cancelAnimationFrame(zoomRafRef.current);
      pinchRef.current.active = false;
      onPinchActive?.(false);
      setPinching(false);
    };
  }, [onZoomChange, onPinchActive, scheduleZoom, status]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setStatus('loading');
      pdfRef.current = null;
      setPdfDoc(null);
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data }).promise;
        if (cancelled) return;
        pdfRef.current = pdf;
        setPdfDoc(pdf);
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
      setPdfDoc(null);
    };
  }, [url, onPageCount]);

  useEffect(() => {
    const host = hostRef.current;
    const stage = stageRef.current;
    if (!host) return;
    const update = () => {
      setContainerWidth((prev) => {
        const next = measurePdfContainerWidth(host, fullscreen);
        if (next <= 0) return prev;
        if (prev > 0 && Math.abs(next - prev) < 8) return prev;
        return next;
      });
    };
    update();
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(update, 0));
    timers.push(setTimeout(update, 120));
    timers.push(setTimeout(update, 320));
    if (typeof ResizeObserver === 'undefined') {
      return () => {
        timers.forEach(clearTimeout);
      };
    }
    const ro = new ResizeObserver(() => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = setTimeout(() => {
        update();
      }, RESIZE_DEBOUNCE_MS);
    });
    ro.observe(host);
    if (stage) ro.observe(stage);
    return () => {
      ro.disconnect();
      timers.forEach(clearTimeout);
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
    };
  }, [status, fullscreen]);

  useEffect(() => {
    if (status !== 'ready') return;
    const host = hostRef.current;
    if (!host) return;
    const raf = window.requestAnimationFrame(() => {
      const w = measurePdfContainerWidth(host, fullscreen);
      if (w > 0) setContainerWidth(w);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [status, fullscreen, pageCount]);

  useEffect(() => {
    if (pageFromScrollRef.current) {
      pageFromScrollRef.current = false;
      return;
    }
    if (scrollSyncRef.current) return;
    const el = pageRefs.current[pageIndex];
    if (!el) return;
    scrollSyncRef.current = true;
    el.scrollIntoView({ block: 'start', behavior: 'auto' });
    requestAnimationFrame(() => {
      scrollSyncRef.current = false;
    });
  }, [pageIndex, url, pageCount]);

  const handleScroll = useCallback(() => {
    suppressTapRef.current = true;
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const stage = stageRef.current;
      if (!stage || scrollSyncRef.current) return;
      const mid = stage.scrollTop + stage.clientHeight * 0.35;
      let active = 0;
      for (let i = 0; i < pageRefs.current.length; i++) {
        const el = pageRefs.current[i];
        if (el && el.offsetTop <= mid) active = i;
      }
      if (active !== activePageRef.current) {
        activePageRef.current = active;
        pageFromScrollRef.current = true;
        onPageIndexChange?.(active);
      }
    });
  }, [onPageIndexChange]);

  const handleContentClick = useCallback(() => {
    if (suppressTapRef.current) {
      suppressTapRef.current = false;
      return;
    }
    onTap?.();
  }, [onTap]);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current != null) window.cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

  if (status === 'error') {
    return <p className="muted shelf-pdf-status">无法加载 PDF</p>;
  }

  const pdf = pdfDoc;
  const zoomed = zoom > 1.001;

  return (
    <div
      className={`shelf-pdf-pager shelf-pdf-pager-scroll${fullscreen ? ' is-fullscreen' : ''}${pinching ? ' is-pinching' : ''}`}
      onClick={fullscreen ? undefined : handleContentClick}
    >
      {fullscreen && onExitFullscreen ? (
        <button
          type="button"
          className="shelf-pdf-toolbar-btn shelf-pdf-exit-fullscreen-br"
          aria-label="退出全屏"
          onClick={(e) => {
            e.stopPropagation();
            onExitFullscreen();
          }}
        >
          ✕ 退出
        </button>
      ) : null}

      {status === 'loading' ? (
        <p className="muted shelf-pdf-status" role="status">
          正在加载 PDF…
        </p>
      ) : null}
      {status === 'fallback' ? (
        <div className="shelf-pdf-fallback">
          <p className="muted">预览引擎不可用，已切换系统阅读器。</p>
          <iframe
            src={url}
            className="shelf-pdf-fallback-frame"
            title={title}
          />
          <a className="shelf-pdf-open-link" href={url} target="_blank" rel="noopener noreferrer">
            在新窗口打开 PDF
          </a>
        </div>
      ) : (
      <div ref={hostRef} className="shelf-pdf-pager-host">
        <div
          ref={stageRef}
          className={`shelf-pdf-pager-stage is-scrollable${zoomed ? ' is-zoomed' : ''}`}
          aria-busy={status === 'loading'}
          onScroll={handleScroll}
        >
          {status === 'ready' && pdf && pageCount > 0 && containerWidth > 0 ? (
            <div className="shelf-pdf-scroll-stack">
              {Array.from({ length: pageCount }, (_, i) => (
                <div
                  key={`${url}-${i}`}
                  ref={(el) => {
                    pageRefs.current[i] = el;
                  }}
                >
                  <PdfPageTile
                    pdf={pdf}
                    pageNum={i + 1}
                    url={url}
                    containerWidth={containerWidth}
                    title={title}
                    fullscreen={fullscreen}
                    zoom={zoom}
                    scrollRootRef={stageRef}
                  />
                </div>
              ))}
            </div>
          ) : status === 'ready' && pdf && pageCount > 0 ? (
            <p className="muted shelf-pdf-status" role="status">
              正在排版 PDF…
            </p>
          ) : null}
        </div>
      </div>
      )}
    </div>
  );
}
