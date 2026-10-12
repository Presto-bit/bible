'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import { knowledgeMediaUrl, knowledgeRasterSources } from '@/lib/knowledge_media_url';
import { writeManuscriptPage } from '@/lib/manuscript_progress';
import { isShareAbortError, shareOutbound } from '@/lib/share_outbound';
import type { ManuscriptFolioPage } from '@/components/knowledge/KnowledgeManuscriptFolio';
import {
  beginKnowledgeCollapse,
  revealKnowledgeExpand,
} from '@/lib/knowledge_nav';
import { ManuscriptPageEngagement } from '@/components/knowledge/ManuscriptPageEngagement';

type Props = {
  pages: ManuscriptFolioPage[];
  title: string;
  /** 专题 id，用于本机续读与赞评 */
  tourId?: string;
  onClose: () => void;
  /** 第一页再向「上一页」方向滑：退出专题 */
  onExitTopic: () => void;
};

function ManuscriptRaster({
  path,
  alt,
  eager,
  onPaint,
}: {
  path: string;
  alt: string;
  eager?: boolean;
  onPaint?: () => void;
}) {
  const { webp, fallback } = knowledgeRasterSources(path);
  // WebP 优先；缺文件再回退 PNG
  const [src, setSrc] = useState(() => webp || fallback);
  useEffect(() => {
    setSrc(webp || fallback);
  }, [webp, fallback]);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="knowledge-viewer-img"
      src={src}
      alt={alt}
      width={1080}
      height={1920}
      draggable={false}
      decoding="async"
      loading={eager ? 'eager' : 'lazy'}
      fetchPriority={eager ? 'high' : 'low'}
      sizes="100vw"
      onLoad={() => onPaint?.()}
      onError={() => {
        if (webp && src === webp && src !== fallback) {
          setSrc(fallback);
          return;
        }
        onPaint?.();
      }}
    />
  );
}

function BackGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M14.7 5.3a1 1 0 0 1 0 1.4L9.4 12l5.3 5.3a1 1 0 1 1-1.4 1.4l-6-6a1 1 0 0 1 0-1.4l6-6a1 1 0 0 1 1.4 0Z"
      />
    </svg>
  );
}

type ZoomState = { scale: number; x: number; y: number };

/**
 * 双击进入缩放；拖移用 DOM 直写 transform，避免 setState 每帧重渲大图。
 * 未缩放时不绑非 passive touchmove，纵/横滑交给外层。
 */
function PinchZoomPane({
  children,
  enabled,
  onZoomChange,
}: {
  children: ReactNode;
  enabled: boolean;
  onZoomChange?: (zoomed: boolean) => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const zRef = useRef<ZoomState>({ scale: 1, x: 0, y: 0 });
  const innerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const pinch = useRef<{ startDist: number; startScale: number } | null>(null);
  const pan = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const lastTap = useRef(0);
  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;

  const paint = useCallback((next: ZoomState) => {
    const scale = Math.min(4, Math.max(1, next.scale));
    const capped =
      scale <= 1.02
        ? { scale: 1, x: 0, y: 0 }
        : { scale, x: next.x, y: next.y };
    zRef.current = capped;
    const el = innerRef.current;
    if (el) {
      el.style.transform = `translate3d(${capped.x}px, ${capped.y}px, 0) scale(${capped.scale})`;
      el.style.willChange = capped.scale > 1.02 ? 'transform' : 'auto';
    }
    const isZ = capped.scale > 1.02;
    setZoomed((prev) => {
      if (prev === isZ) return prev;
      onZoomChangeRef.current?.(isZ);
      return isZ;
    });
  }, []);

  const resetZoom = useCallback(() => {
    paint({ scale: 1, x: 0, y: 0 });
  }, [paint]);

  useEffect(() => {
    if (!enabled) resetZoom();
  }, [enabled, resetZoom]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || !enabled) return;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const a = e.touches[0];
        const b = e.touches[1];
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        pinch.current = { startDist: dist, startScale: zRef.current.scale };
        pan.current = null;
        return;
      }
      if (e.touches.length === 1 && zRef.current.scale > 1.02) {
        pan.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          ox: zRef.current.x,
          oy: zRef.current.y,
        };
      }
    };

    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinch.current) {
        e.preventDefault();
        const a = e.touches[0];
        const b = e.touches[1];
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (pinch.current.startDist <= 0) return;
        paint({
          ...zRef.current,
          scale: pinch.current.startScale * (dist / pinch.current.startDist),
        });
        return;
      }
      if (e.touches.length === 1 && pan.current && zRef.current.scale > 1.02) {
        e.preventDefault();
        const dx = e.touches[0].clientX - pan.current.x;
        const dy = e.touches[0].clientY - pan.current.y;
        paint({
          scale: zRef.current.scale,
          x: pan.current.ox + dx,
          y: pan.current.oy + dy,
        });
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch.current = null;
      if (e.touches.length === 0) pan.current = null;
    };

    const onDoubleTap = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const now = Date.now();
      if (now - lastTap.current < 280) {
        e.preventDefault();
        if (zRef.current.scale > 1.02) resetZoom();
        else paint({ scale: 2.2, x: 0, y: 0 });
        lastTap.current = 0;
        return;
      }
      lastTap.current = now;
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchstart', onDoubleTap, { passive: false });
    // 仅缩放态需要非 passive；未缩放不拦截滚动
    const moveOpts: AddEventListenerOptions = { passive: false };
    el.addEventListener('touchmove', onMove, moveOpts);
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchstart', onDoubleTap);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [enabled, paint, resetZoom]);

  return (
    <div
      ref={hostRef}
      className={`knowledge-viewer-zoom${zoomed ? ' is-zoomed' : ''}`}
    >
      <div
        ref={innerRef}
        className="knowledge-viewer-zoom-inner"
        style={{ transform: 'translate3d(0,0,0) scale(1)' }}
      >
        {children}
      </div>
    </div>
  );
}

function preloadSrc(src: string) {
  if (typeof window === 'undefined' || !src) return;
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
}

/**
 * §19.14.17 小红书式全屏手稿：一页一竖卷；横滑翻页；双击缩放。
 */
export function KnowledgeManuscriptViewer({
  pages,
  title,
  tourId,
  onClose,
  onExitTopic,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pageScrollRef = useRef<HTMLDivElement | null>(null);
  const commentsRef = useRef<HTMLElement | null>(null);
  const total = pages.length;
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const [shareBusy, setShareBusy] = useState(false);
  const [pageZoomed, setPageZoomed] = useState(false);
  const [chromeHidden, setChromeHidden] = useState(true);
  const [motionPhase, setMotionPhase] = useState<'enter' | 'ready' | 'leave'>('enter');
  const [engageReady, setEngageReady] = useState(false);
  const [neighborsReady, setNeighborsReady] = useState(false);
  const leavingRef = useRef(false);
  const revealedRef = useRef(false);
  const [loaded, setLoaded] = useState<Record<number, boolean>>(() => ({ 0: true }));
  const edgeSwipe = useRef<{ x: number; y: number; atStart: boolean } | null>(null);
  const tapTrack = useRef<{ x: number; y: number; t: number } | null>(null);
  const suppressClick = useRef(false);
  const didRestoreScroll = useRef(false);
  const current = pages[index] || pages[0];
  const pageMedia = current?.media;

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    pageScrollRef.current?.scrollTo({ top: 0 });
    setPageZoomed(false);
  }, [index]);

  useEffect(() => {
    document.documentElement.classList.add('knowledge-viewer-lock');
    document.documentElement.style.overflow = 'hidden';
    if (document.body) document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.classList.remove('knowledge-viewer-lock');
      document.documentElement.style.removeProperty('overflow');
      document.body?.style.removeProperty('overflow');
    };
  }, []);

  useEffect(() => {
    setMotionPhase('ready');
  }, []);

  const revealShell = useCallback(() => {
    if (revealedRef.current) return;
    revealedRef.current = true;
    revealKnowledgeExpand();
  }, []);

  useEffect(() => {
    revealShell();
    const t = window.setTimeout(revealShell, 120);
    return () => window.clearTimeout(t);
  }, [revealShell]);

  // 首屏只保当前图：评论与邻页延后，避免抢带宽/主线程
  useEffect(() => {
    setEngageReady(false);
    setNeighborsReady(false);
    const page = pageScrollRef.current;
    const onScroll = () => {
      if ((page?.scrollTop || 0) > 48) setEngageReady(true);
    };
    page?.addEventListener('scroll', onScroll, { passive: true });
    const engageTimer = window.setTimeout(() => setEngageReady(true), 900);
    const neighborTimer = window.setTimeout(() => setNeighborsReady(true), 280);
    return () => {
      page?.removeEventListener('scroll', onScroll);
      window.clearTimeout(engageTimer);
      window.clearTimeout(neighborTimer);
    };
  }, [index]);

  const softLeave = useCallback((done: () => void) => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 先起缩回垫层，再藏 Viewer，避免闪白/闪深色
    const collapsing = beginKnowledgeCollapse();
    setMotionPhase('leave');
    if (reduced || !collapsing) {
      window.setTimeout(done, reduced ? 0 : 120);
      return;
    }
    // 等 Host 画上全屏垫后再导航；缩回动画由 Host 继续
    window.setTimeout(done, 70);
  }, []);

  const handleClose = useCallback(() => softLeave(onClose), [softLeave, onClose]);
  const handleExitTopic = useCallback(
    () => softLeave(onExitTopic),
    [softLeave, onExitTopic],
  );

  const scrollToComments = useCallback(() => {
    setChromeHidden(false);
    setEngageReady(true);
    const el = commentsRef.current;
    const page = pageScrollRef.current;
    if (!el || !page) return;
    const top = el.offsetTop - 12;
    page.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || didRestoreScroll.current) return;
    const jump = () => {
      if (!el.clientWidth) return;
      didRestoreScroll.current = true;
      el.scrollLeft = 0;
      setIndex(0);
    };
    jump();
    requestAnimationFrame(jump);
  }, [total]);

  useEffect(() => {
    if (!tourId || total <= 0) return;
    writeManuscriptPage(tourId, index);
  }, [tourId, index, total]);

  // 当前页立即加载；邻页等 neighborsReady
  useEffect(() => {
    setLoaded((prev) => {
      const next = { ...prev, [index]: true };
      if (neighborsReady) {
        for (let i = Math.max(0, index - 1); i <= Math.min(total - 1, index + 1); i++) {
          next[i] = true;
        }
      }
      return next;
    });
    const warm = neighborsReady
      ? [index - 1, index, index + 1]
      : [index];
    for (const i of warm) {
      if (i < 0 || i >= total) continue;
      const p = pages[i];
      if (!p?.src) continue;
      const { webp, fallback } = knowledgeRasterSources(p.src);
      if (webp) preloadSrc(webp);
      else preloadSrc(fallback);
    }
  }, [index, pages, total, neighborsReady]);

  const syncIndex = useCallback(() => {
    const el = scrollerRef.current;
    if (!el || !el.clientWidth) return;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    setIndex(Math.max(0, Math.min(total - 1, next)));
  }, [total]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => syncIndex();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [syncIndex]);

  const onScrollerTouchStart = (e: ReactTouchEvent) => {
    if (pageZoomed || e.touches.length !== 1) {
      edgeSwipe.current = null;
      tapTrack.current = null;
      return;
    }
    const t = e.touches[0];
    edgeSwipe.current = {
      x: t.clientX,
      y: t.clientY,
      atStart: indexRef.current === 0,
    };
    tapTrack.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };

  const onScrollerTouchEnd = (e: ReactTouchEvent) => {
    const start = edgeSwipe.current;
    const tap = tapTrack.current;
    edgeSwipe.current = null;
    tapTrack.current = null;
    const t = e.changedTouches[0];
    if (!t) return;

    if (tap && !pageZoomed) {
      const dx = t.clientX - tap.x;
      const dy = t.clientY - tap.y;
      const dt = Date.now() - tap.t;
      if (dt < 350 && Math.hypot(dx, dy) < 12) {
        suppressClick.current = true;
        setChromeHidden((v) => !v);
        return;
      }
    }

    if (!start?.atStart || pageZoomed) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (dx > 72 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      handleExitTopic();
    }
  };

  const onShare = async () => {
    if (shareBusy || !current) return;
    setShareBusy(true);
    try {
      if (current.src) {
        const { webp, fallback } = knowledgeRasterSources(current.src);
        let res = webp ? await fetch(webp) : null;
        if (!res || !res.ok) res = await fetch(fallback);
        if (!res.ok) throw new Error('missing');
        const blob = await res.blob();
        const file = new File([blob], current.src.split('/').pop() || 'manuscript.png', {
          type: blob.type || 'image/png',
        });
        const result = await shareOutbound({
          title,
          text: `${title} · 彼爱手稿`,
          url: typeof window !== 'undefined' ? window.location.href : '',
          file,
          allowDownload: true,
        });
        if (result === 'cancelled') return;
      } else {
        const result = await shareOutbound({
          title,
          text: `${title} · ${current.text?.body?.slice(0, 80) || '彼爱手稿'}`,
          url: typeof window !== 'undefined' ? window.location.href : '',
        });
        if (result === 'cancelled') return;
      }
    } catch (e) {
      if (isShareAbortError(e)) return;
    } finally {
      setShareBusy(false);
    }
  };

  const [mediaPlaying, setMediaPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setMediaPlaying(false);
    audioRef.current?.pause();
    videoRef.current?.pause();
  }, [index, pageMedia?.url]);

  const toggleMedia = () => {
    if (!pageMedia) return;
    if (pageMedia.type === 'video') {
      const el = videoRef.current;
      if (!el) return;
      if (el.paused) {
        void el.play().then(() => setMediaPlaying(true)).catch(() => setMediaPlaying(false));
      } else {
        el.pause();
        setMediaPlaying(false);
      }
      return;
    }
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play().then(() => setMediaPlaying(true)).catch(() => setMediaPlaying(false));
    } else {
      el.pause();
      setMediaPlaying(false);
    }
  };

  return (
    <div
      className={[
        'knowledge-viewer',
        chromeHidden ? 'is-chrome-hidden' : '',
        motionPhase === 'ready' ? 'is-ready' : '',
        motionPhase === 'leave' ? 'is-leave' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <header className="knowledge-viewer-bar">
        <button
          type="button"
          className="knowledge-viewer-icon-btn"
          aria-label="返回"
          onClick={handleClose}
        >
          <BackGlyph />
        </button>
        <div className="knowledge-viewer-head">
          <p className="knowledge-viewer-title">{title}</p>
          {total > 1 ? (
            <p className="knowledge-viewer-page-meta" aria-live="polite">
              第 {index + 1} / {total}
            </p>
          ) : null}
        </div>
        <span className="knowledge-viewer-bar-spacer" aria-hidden />
      </header>

      <div className="knowledge-viewer-body">
        <div
          ref={scrollerRef}
          className={`knowledge-viewer-scroller${pageZoomed ? ' is-zoom-locked' : ''}`}
          onTouchStart={onScrollerTouchStart}
          onTouchEnd={onScrollerTouchEnd}
        >
          {pages.map((p, i) => {
            const near = i === index || (neighborsReady && Math.abs(i - index) <= 1);
            const show = near && Boolean(loaded[i]);
            const isVideoPage = p.media?.type === 'video' && Boolean(p.media.url);
            const isCurrent = i === index;
            return (
              <div
                key={p.key}
                ref={isCurrent ? pageScrollRef : undefined}
                className="knowledge-viewer-page"
              >
                <div
                  className="knowledge-viewer-stage"
                  onClick={(e) => {
                    if (suppressClick.current) {
                      suppressClick.current = false;
                      return;
                    }
                    if (pageZoomed) return;
                    if ((e.target as HTMLElement).closest('button, a, video, audio, input')) {
                      return;
                    }
                    setChromeHidden((v) => !v);
                  }}
                >
                  {!near ? (
                    <span className="knowledge-viewer-img-placeholder" aria-hidden />
                  ) : isCurrent && Boolean(p.src) && !p.text && !isVideoPage ? (
                    <PinchZoomPane
                      enabled
                      onZoomChange={(z) => {
                        if (isCurrent) setPageZoomed(z);
                      }}
                    >
                      {!show ? (
                        <span className="knowledge-viewer-img-placeholder" aria-hidden />
                      ) : (
                        <ManuscriptRaster
                          path={p.src!}
                          alt={p.alt}
                          eager
                          onPaint={i === 0 ? revealShell : undefined}
                        />
                      )}
                    </PinchZoomPane>
                  ) : !show ? (
                    <span className="knowledge-viewer-img-placeholder" aria-hidden />
                  ) : isVideoPage ? (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video
                      ref={isCurrent ? videoRef : undefined}
                      className="knowledge-viewer-video-inline"
                      src={knowledgeMediaUrl(p.media!.url)}
                      playsInline
                      controls
                      preload={isCurrent ? 'metadata' : 'none'}
                      poster={p.src ? knowledgeRasterSources(p.src).fallback : undefined}
                      onEnded={() => setMediaPlaying(false)}
                      onPause={() => setMediaPlaying(false)}
                      onPlay={() => setMediaPlaying(true)}
                    />
                  ) : p.text ? (
                    <article className="knowledge-viewer-text-leaf">
                      <p className="knowledge-viewer-text-leaf-brand">彼爱 · 长文</p>
                      {p.text.title ? <h3>{p.text.title}</h3> : null}
                      {p.text.body
                        .split(/\n\s*\n+/)
                        .map((para) => para.trim())
                        .filter(Boolean)
                        .map((para, pi) => (
                          <p key={pi}>{para}</p>
                        ))}
                    </article>
                  ) : p.src ? (
                    <ManuscriptRaster
                      path={p.src}
                      alt={p.alt}
                      eager={false}
                      onPaint={undefined}
                    />
                  ) : (
                    <span className="knowledge-viewer-img-placeholder" aria-hidden />
                  )}

                  {isCurrent && total > 1 ? (
                    <div className="knowledge-viewer-dots" aria-hidden>
                      {pages.map((dot, di) => (
                        <span key={dot.key} className={di === index ? 'is-on' : undefined} />
                      ))}
                    </div>
                  ) : null}
                </div>

                {isCurrent ? (
                  <div className="knowledge-viewer-page-tail">
                    <p className="manuscript-comments-hint muted">
                      {total > 1
                        ? '左右翻页 · 下滑看评论 · 双击放大'
                        : '下滑查看评论 · 双击放大'}
                    </p>
                    {tourId && engageReady ? (
                      <ManuscriptPageEngagement
                        topicId={tourId}
                        pageKey={p.key}
                        commentsRef={commentsRef}
                        onScrollToComments={scrollToComments}
                        chromeHidden={chromeHidden}
                        shareBusy={shareBusy}
                        onShare={() => void onShare()}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {pageMedia?.type === 'audio' ? (
        <div className="knowledge-viewer-media-dock">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio
            ref={audioRef}
            src={knowledgeMediaUrl(pageMedia.url)}
            preload="metadata"
            onEnded={() => setMediaPlaying(false)}
            onPause={() => setMediaPlaying(false)}
            onPlay={() => setMediaPlaying(true)}
          />
          <button
            type="button"
            className="knowledge-viewer-media-btn"
            aria-label={mediaPlaying ? '暂停' : '播放音频'}
            onClick={toggleMedia}
          >
            {mediaPlaying ? '‖' : '听'}
          </button>
          <span className="knowledge-viewer-media-label">
            {pageMedia.label || '本页音频'}
          </span>
        </div>
      ) : null}
    </div>
  );
}
