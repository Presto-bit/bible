'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { clampShelfPdfZoom } from '@/lib/shelf_reader_contract';

type Props = {
  url: string;
  title: string;
  pageIndex: number;
  baseScale?: number;
  initialZoom?: number;
  onPageCount?: (count: number) => void;
  onPageIndexChange?: (index: number) => void;
  onTap?: () => void;
  onPinchActive?: (active: boolean) => void;
  /** 竖滑到文档末/首继续推：'next' | 'prev' */
  onSectionEdge?: (edge: 'next' | 'prev') => void;
};

/** 默认略放大，弥补教案 PDF 字号偏小 */
const PDF_BASE_SCALE_DEFAULT = 1.2;

function computePdfLayout(
  containerWidth: number,
  pageWidth: number,
  pageHeight: number,
  baseScale: number,
  zoom = 1,
) {
  const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 2 : 2, 2);
  const scale = (containerWidth / pageWidth) * baseScale * zoom;
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

function measurePdfContainerWidth(host: HTMLElement | null): number {
  const fromHost = host?.getBoundingClientRect().width ?? host?.clientWidth ?? 0;
  if (fromHost > 0) return fromHost;
  const fromParent = host?.parentElement?.clientWidth ?? 0;
  if (fromParent > 0) return fromParent;
  if (typeof window !== 'undefined') {
    return Math.max(280, Math.min(window.innerWidth - 32, 720));
  }
  return 720;
}

function pdfCacheKey(url: string, pageNum: number, w: number, baseScale: number, zoom: number) {
  return `${url}|${pageNum}|${Math.round(w)}|${Math.round(baseScale * zoom * 100)}`;
}

function touchSpan(touches: TouchList): number {
  if (touches.length < 2) return 0;
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
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

const TAP_SLOP_PX = 14;

function PdfPageTile({
  pdf,
  pageNum,
  url,
  containerWidth,
  baseScale,
  zoom,
  title,
  scrollRootRef,
  textLayerEnabled = true,
}: {
  pdf: import('pdfjs-dist').PDFDocumentProxy;
  pageNum: number;
  url: string;
  containerWidth: number;
  baseScale: number;
  zoom: number;
  title: string;
  scrollRootRef: RefObject<HTMLElement | null>;
  textLayerEnabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(pageNum === 1);
  const [placeholderH, setPlaceholderH] = useState(480);
  const [renderError, setRenderError] = useState(false);
  const [hasText, setHasText] = useState(false);
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
        rootMargin: '320px 0px',
        threshold: 0.01,
      },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [pageNum, scrollRootRef]);

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
        const { renderScale, cssWidth, cssHeight } = computePdfLayout(
          w,
          base.width,
          base.height,
          baseScale,
          zoom,
        );
        setPlaceholderH(cssHeight);
        const scaled = page.getViewport({ scale: renderScale });
        const cacheKey = pdfCacheKey(url, pageNum, w, baseScale, zoom);
        const cached = pdfPageCache.get(cacheKey);
        if (cached) {
          canvas.width = cached.width;
          canvas.height = cached.height;
          canvas.style.width = `${cssWidth}px`;
          canvas.style.height = `${cssHeight}px`;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(cached, 0, 0);
        } else {
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
        }

        if (textLayerEnabled && textLayerRef.current) {
          const layer = textLayerRef.current;
          layer.innerHTML = '';
          layer.style.width = `${cssWidth}px`;
          layer.style.height = `${cssHeight}px`;
          try {
            const textContent = await page.getTextContent();
            if (cancelled) return;
            const items = textContent.items as Array<{ str?: string; transform?: number[]; width?: number }>;
            let chars = 0;
            for (const item of items) {
              const str = item.str || '';
              if (!str.trim() || !item.transform) continue;
              chars += str.length;
              const tx = item.transform;
              const fontHeight = Math.hypot(tx[2], tx[3]) * (cssWidth / scaled.width);
              const left = tx[4] * (cssWidth / scaled.width);
              const top = cssHeight - tx[5] * (cssHeight / scaled.height) - fontHeight;
              const span = document.createElement('span');
              span.textContent = str;
              span.style.left = `${left}px`;
              span.style.top = `${top}px`;
              span.style.fontSize = `${Math.max(6, fontHeight)}px`;
              span.style.transform = 'scaleX(1)';
              layer.appendChild(span);
            }
            setHasText(chars > 12);
          } catch {
            setHasText(false);
          }
        }
      } catch {
        if (!cancelled) setRenderError(true);
      }
    };
    void render();
    return () => {
      cancelled = true;
    };
  }, [visible, pdf, pageNum, url, containerWidth, baseScale, zoom, textLayerEnabled]);

  const zoomed = zoom > 1.001;

  return (
    <div ref={rootRef} className="shelf-pdf-scroll-page" style={{ minHeight: placeholderH }}>
      {renderError ? (
        <p className="muted shelf-pdf-status">本页渲染失败</p>
      ) : null}
      <div className="shelf-pdf-page-stack">
        <canvas
          ref={canvasRef}
          className={`shelf-pdf-page-canvas is-readable${zoomed ? ' is-zoomed' : ''}`}
          role="img"
          aria-label={`${title} 第 ${pageNum} 页`}
        />
        {textLayerEnabled ? (
          <div
            ref={textLayerRef}
            className={`shelf-pdf-text-layer${hasText ? ' is-active' : ''}`}
            aria-hidden={!hasText}
          />
        ) : null}
      </div>
    </div>
  );
}

export default function ShelfPdfPager({
  url,
  title,
  pageIndex,
  baseScale = PDF_BASE_SCALE_DEFAULT,
  initialZoom = 1,
  onPageCount,
  onPageIndexChange,
  onTap,
  onPinchActive,
  onSectionEdge,
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
  const tapRef = useRef({ x: 0, y: 0, pointerId: -1 });
  const pinchRef = useRef({ active: false, startSpan: 0, startZoom: 1 });
  const zoomRafRef = useRef<number | null>(null);
  const pendingZoomRef = useRef<number | null>(null);
  const zoomRef = useRef(1);
  const lastScrollTopRef = useRef(0);
  const edgeLockRef = useRef(false);
  const edgeLockTimerRef = useRef<number | null>(null);
  const onSectionEdgeRef = useRef(onSectionEdge);
  onSectionEdgeRef.current = onSectionEdge;
  const [pinching, setPinching] = useState(false);
  const [zoom, setZoom] = useState(() => clampShelfPdfZoom(initialZoom));
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback' | 'error'>('loading');
  const [pageCount, setPageCount] = useState(0);
  const [containerWidth, setContainerWidth] = useState(() => measurePdfContainerWidth(null));
  const [pdfDoc, setPdfDoc] = useState<import('pdfjs-dist').PDFDocumentProxy | null>(null);

  useEffect(() => {
    activePageRef.current = pageIndex;
  }, [pageIndex]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const scheduleZoom = useCallback((next: number) => {
    pendingZoomRef.current = clampShelfPdfZoom(next);
    if (zoomRafRef.current != null) return;
    zoomRafRef.current = window.requestAnimationFrame(() => {
      zoomRafRef.current = null;
      const z = pendingZoomRef.current;
      pendingZoomRef.current = null;
      if (z != null) setZoom(z);
    });
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

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
      scheduleZoom(pinchRef.current.startZoom * (span / pinchRef.current.startSpan));
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
  }, [onPinchActive, scheduleZoom, status]);

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
        const next = measurePdfContainerWidth(host);
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
  }, [status]);

  useEffect(() => {
    if (status !== 'ready') return;
    const host = hostRef.current;
    if (!host) return;
    const raf = window.requestAnimationFrame(() => {
      const w = measurePdfContainerWidth(host);
      if (w > 0) setContainerWidth(w);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [status, pageCount]);

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

  const fireSectionEdge = useCallback((edge: 'next' | 'prev') => {
    if (!onSectionEdgeRef.current || edgeLockRef.current) return;
    edgeLockRef.current = true;
    onSectionEdgeRef.current(edge);
    if (edgeLockTimerRef.current != null) window.clearTimeout(edgeLockTimerRef.current);
    edgeLockTimerRef.current = window.setTimeout(() => {
      edgeLockRef.current = false;
      edgeLockTimerRef.current = null;
    }, 900);
  }, []);

  const handleScroll = useCallback(() => {
    suppressTapRef.current = true;
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const stage = stageRef.current;
      if (!stage || scrollSyncRef.current) return;
      const max = Math.max(0, stage.scrollHeight - stage.clientHeight);
      const top = stage.scrollTop;
      const dy = top - lastScrollTopRef.current;
      lastScrollTopRef.current = top;
      const mid = top + stage.clientHeight * 0.35;
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
      if (max > 24) {
        if (top >= max - 24 && dy > 0) fireSectionEdge('next');
        else if (top <= 24 && dy < 0) fireSectionEdge('prev');
      }
    });
  }, [onPageIndexChange, fireSectionEdge]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !onSectionEdge) return;
    const onWheel = (e: WheelEvent) => {
      if (scrollSyncRef.current || edgeLockRef.current) return;
      const max = Math.max(0, stage.scrollHeight - stage.clientHeight);
      const top = stage.scrollTop;
      if (e.deltaY > 8 && top >= max - 8) fireSectionEdge('next');
      else if (e.deltaY < -8 && top <= 8) fireSectionEdge('prev');
    };
    stage.addEventListener('wheel', onWheel, { passive: true });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [onSectionEdge, fireSectionEdge, status, pageCount]);

  const handleContentPointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    tapRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
  }, []);

  const handleContentPointerUp = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (e.pointerId !== tapRef.current.pointerId) return;
      if (suppressTapRef.current) {
        suppressTapRef.current = false;
        return;
      }
      if (Math.hypot(e.clientX - tapRef.current.x, e.clientY - tapRef.current.y) > TAP_SLOP_PX) return;
      onTap?.();
    },
    [onTap],
  );

  useEffect(() => {
    return () => {
      if (scrollRafRef.current != null) window.cancelAnimationFrame(scrollRafRef.current);
      if (edgeLockTimerRef.current != null) window.clearTimeout(edgeLockTimerRef.current);
    };
  }, []);

  if (status === 'error') {
    return <p className="muted shelf-pdf-status">无法加载 PDF</p>;
  }

  const pdf = pdfDoc;
  const zoomed = zoom > 1.001;

  return (
    <div
      className={`shelf-pdf-pager shelf-pdf-pager-scroll${pinching ? ' is-pinching' : ''}`}
      onPointerDown={handleContentPointerDown}
      onPointerUp={handleContentPointerUp}
    >
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
            className={`shelf-pdf-pager-stage is-scrollable is-readable${zoomed ? ' is-zoomed' : ''}`}
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
                      baseScale={baseScale}
                      zoom={zoom}
                      title={title}
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
