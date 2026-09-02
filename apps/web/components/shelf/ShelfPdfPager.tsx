'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Props = {
  url: string;
  title: string;
  pageIndex: number;
  onPageCount?: (count: number) => void;
  onPageIndexChange?: (index: number) => void;
  onSectionEdge?: (edge: 'prev' | 'next') => void;
  canPrevSection?: boolean;
  canNextSection?: boolean;
  onTap?: () => void;
  fullscreen?: boolean;
  onExitFullscreen?: () => void;
};

/** width = 贴宽（纵向连读默认）；page = 适页；actual = 100% */
type ViewMode = 'actual' | 'page' | 'width';

function computePdfLayout(
  containerWidth: number,
  pageWidth: number,
  pageHeight: number,
  viewMode: ViewMode,
  userZoom: number,
) {
  const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 2 : 2, 2.5);
  const fitW = containerWidth / pageWidth;
  const fitH = containerWidth / pageWidth; // unused for width mode stack
  const fitPage = Math.min(fitW, fitH);
  const base = viewMode === 'page' ? fitPage : viewMode === 'width' ? fitW : 1;
  const scale = base * userZoom;
  return {
    dpr,
    renderScale: scale * dpr,
    cssWidth: pageWidth * scale,
    cssHeight: pageHeight * scale,
  };
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const RESIZE_DEBOUNCE_MS = 180;
const PDF_PAGE_CACHE_MAX = 48;
const EDGE_THRESHOLD = 28;
const SECTION_EDGE_COOLDOWN_MS = 900;
const pdfPageCache = new Map<string, ImageBitmap>();

function pdfCacheKey(
  url: string,
  pageNum: number,
  viewMode: ViewMode,
  userZoom: number,
  w: number,
) {
  return `${url}|${pageNum}|${viewMode}|${userZoom}|${Math.round(w)}`;
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

function PdfPageTile({
  pdf,
  pageNum,
  url,
  viewMode,
  userZoom,
  containerWidth,
  title,
}: {
  pdf: import('pdfjs-dist').PDFDocumentProxy;
  pageNum: number;
  url: string;
  viewMode: ViewMode;
  userZoom: number;
  containerWidth: number;
  title: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true);
      },
      { rootMargin: '240px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !canvasRef.current) return;
    let cancelled = false;
    const render = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        const page = await pdf.getPage(pageNum);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const w = containerWidth || Math.min(window.innerWidth - 24, 720);
        const { dpr, renderScale, cssWidth, cssHeight } = computePdfLayout(
          w,
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
        const cacheKey = pdfCacheKey(url, pageNum, viewMode, userZoom, w);
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
          /* ignore */
        }
      } catch {
        /* ignore */
      }
    };
    void render();
    return () => {
      cancelled = true;
    };
  }, [visible, pdf, pageNum, url, viewMode, userZoom, containerWidth]);

  return (
    <div ref={rootRef} className="shelf-pdf-scroll-page">
      <canvas
        ref={canvasRef}
        className="shelf-pdf-page-canvas"
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
  onSectionEdge,
  canPrevSection = false,
  canNextSection = false,
  onTap,
  fullscreen = false,
  onExitFullscreen,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<import('pdfjs-dist').PDFDocumentProxy | null>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edgeLockRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const activePageRef = useRef(pageIndex);
  const scrollSyncRef = useRef(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback' | 'error'>('loading');
  const [pageCount, setPageCount] = useState(0);
  const [layoutTick, setLayoutTick] = useState(0);
  const [userZoom, setUserZoom] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>('width');
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    activePageRef.current = pageIndex;
  }, [pageIndex]);

  useEffect(() => {
    setUserZoom(1);
    setViewMode('width');
  }, [url]);

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
    const host = hostRef.current;
    if (!host) return;
    const update = () => setContainerWidth(host.clientWidth || Math.min(window.innerWidth - 24, 720));
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = setTimeout(() => {
        update();
        setLayoutTick((n) => n + 1);
      }, RESIZE_DEBOUNCE_MS);
    });
    ro.observe(host);
    return () => {
      ro.disconnect();
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
    };
  }, [status]);

  useEffect(() => {
    if (scrollSyncRef.current) return;
    const el = pageRefs.current[pageIndex];
    if (!el) return;
    scrollSyncRef.current = true;
    el.scrollIntoView({ block: 'start', behavior: 'auto' });
    requestAnimationFrame(() => {
      scrollSyncRef.current = false;
    });
  }, [pageIndex, url, pageCount, layoutTick]);

  const fireSectionEdge = useCallback(
    (edge: 'prev' | 'next') => {
      if (edgeLockRef.current) return;
      edgeLockRef.current = true;
      onSectionEdge?.(edge);
      window.setTimeout(() => {
        edgeLockRef.current = false;
      }, SECTION_EDGE_COOLDOWN_MS);
    },
    [onSectionEdge],
  );

  const handleScroll = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || scrollSyncRef.current) return;
    const prevTop = lastScrollTopRef.current;
    const top = stage.scrollTop;
    lastScrollTopRef.current = top;
    const goingDown = top > prevTop;
    const goingUp = top < prevTop;

    const mid = top + stage.clientHeight * 0.35;
    let active = 0;
    for (let i = 0; i < pageRefs.current.length; i++) {
      const el = pageRefs.current[i];
      if (el && el.offsetTop <= mid) active = i;
    }
    if (active !== activePageRef.current) {
      activePageRef.current = active;
      onPageIndexChange?.(active);
    }

    const atBottom = top + stage.clientHeight >= stage.scrollHeight - EDGE_THRESHOLD;
    const atTop = top <= EDGE_THRESHOLD;

    if (atBottom && goingDown && canNextSection) {
      fireSectionEdge('next');
    } else if (atTop && goingUp && canPrevSection) {
      fireSectionEdge('prev');
    }
  }, [canNextSection, canPrevSection, fireSectionEdge, onPageIndexChange]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      const stage = stageRef.current;
      if (!stage) return;
      if (stage.scrollTop <= EDGE_THRESHOLD && e.deltaY < 0 && canPrevSection) {
        fireSectionEdge('prev');
      }
    },
    [canPrevSection, fireSectionEdge],
  );

  const resetToFitPage = useCallback(() => {
    setViewMode('page');
    setUserZoom(1);
  }, []);

  const resetToFitWidth = useCallback(() => {
    setViewMode('width');
    setUserZoom(1);
  }, []);

  const bumpZoom = useCallback((delta: number) => {
    setUserZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + delta) * 100) / 100)));
  }, []);

  const onStageTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 2) {
        pinchRef.current = null;
        return;
      }
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinchRef.current = { dist, zoom: userZoom };
    },
    [userZoom],
  );

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
          className={`shelf-pdf-toolbar-btn${viewMode === 'width' ? ' is-active' : ''}`}
          aria-label="贴宽"
          onClick={(e) => {
            e.stopPropagation();
            resetToFitWidth();
          }}
        >
          贴宽
        </button>
      )}
    </>
  );

  const pdf = pdfRef.current;

  return (
    <div
      className={`shelf-pdf-pager shelf-pdf-pager-scroll${fullscreen ? ' is-fullscreen' : ''}`}
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
          className="shelf-pdf-pager-stage is-scrollable"
          aria-busy={status === 'loading'}
          onScroll={handleScroll}
          onWheel={handleWheel}
          onTouchStart={onStageTouchStart}
          onTouchMove={onStageTouchMove}
          onTouchEnd={onStageTouchEnd}
          onTouchCancel={onStageTouchEnd}
        >
          {status === 'ready' && pdf && pageCount > 0 ? (
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
                    viewMode={viewMode}
                    userZoom={userZoom}
                    containerWidth={containerWidth}
                    title={title}
                  />
                </div>
              ))}
              {canNextSection ? (
                <div className="shelf-pdf-scroll-tail" aria-hidden>
                  继续下滑进入下一节
                </div>
              ) : null}
              {canPrevSection ? (
                <div className="shelf-pdf-scroll-head-spacer" aria-hidden />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {!fullscreen ? (
        <div className="shelf-pdf-inline-tools">{zoomToolbar(true)}</div>
      ) : null}
    </div>
  );
}
