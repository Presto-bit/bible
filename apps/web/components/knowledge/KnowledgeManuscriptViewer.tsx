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
import {
  readManuscriptPage,
  writeManuscriptPage,
} from '@/lib/manuscript_progress';
import { isShareAbortError, shareOutbound } from '@/lib/share_outbound';
import type { ManuscriptFolioPage } from '@/components/knowledge/KnowledgeManuscriptFolio';

type Props = {
  pages: ManuscriptFolioPage[];
  title: string;
  /** 专题 id，用于本机续读 */
  tourId?: string;
  onClose: () => void;
  /** 第一页再向「上一页」方向滑：退出专题 */
  onExitTopic: () => void;
};

function ManuscriptRaster({
  path,
  alt,
  eager,
}: {
  path: string;
  alt: string;
  eager?: boolean;
}) {
  const { webp, fallback } = knowledgeRasterSources(path);
  return (
    <picture>
      {webp ? <source type="image/webp" srcSet={webp} /> : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="knowledge-viewer-img"
        src={fallback}
        alt={alt}
        draggable={false}
        decoding="async"
        loading={eager ? 'eager' : 'lazy'}
      />
    </picture>
  );
}

function ShareGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 3.2a1 1 0 0 1 .7.3l3.8 3.8a1 1 0 1 1-1.4 1.4L13 6.4V15a1 1 0 1 1-2 0V6.4L8.9 8.7a1 1 0 1 1-1.4-1.4l3.8-3.8a1 1 0 0 1 .7-.3ZM6 13a1 1 0 0 1 1 1v4h10v-4a1 1 0 1 1 2 0v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1Z"
      />
    </svg>
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

function PinchZoomPane({
  children,
  enabled,
  onZoomChange,
}: {
  children: ReactNode;
  enabled: boolean;
  onZoomChange?: (zoomed: boolean) => void;
}) {
  const [z, setZ] = useState<ZoomState>({ scale: 1, x: 0, y: 0 });
  const zRef = useRef(z);
  zRef.current = z;
  const pinch = useRef<{ startDist: number; startScale: number } | null>(null);
  const pan = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const apply = useCallback(
    (next: ZoomState) => {
      const scale = Math.min(4, Math.max(1, next.scale));
      const capped =
        scale <= 1.02
          ? { scale: 1, x: 0, y: 0 }
          : { scale, x: next.x, y: next.y };
      setZ(capped);
      onZoomChange?.(capped.scale > 1.02);
    },
    [onZoomChange],
  );

  useEffect(() => {
    if (!enabled) apply({ scale: 1, x: 0, y: 0 });
  }, [enabled, apply]);

  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      if (!enabled) return;
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
      if (!enabled) return;
      if (e.touches.length === 2 && pinch.current) {
        e.preventDefault();
        const a = e.touches[0];
        const b = e.touches[1];
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (pinch.current.startDist <= 0) return;
        apply({
          ...zRef.current,
          scale: pinch.current.startScale * (dist / pinch.current.startDist),
        });
        return;
      }
      if (e.touches.length === 1 && pan.current && zRef.current.scale > 1.02) {
        e.preventDefault();
        const dx = e.touches[0].clientX - pan.current.x;
        const dy = e.touches[0].clientY - pan.current.y;
        apply({
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

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [enabled, apply]);

  const zoomed = z.scale > 1.02;

  return (
    <div
      ref={hostRef}
      className={`knowledge-viewer-zoom${zoomed ? ' is-zoomed' : ''}`}
    >
      <div
        className="knowledge-viewer-zoom-inner"
        style={{
          transform: `translate3d(${z.x}px, ${z.y}px, 0) scale(${z.scale})`,
        }}
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
 * §19.14.17 小红书式全屏手稿查看：横滑翻页、双手缩放、返回、系统分享。
 * 第一页再向上一页方向滑 → 退出专题；记住页码下次续读。
 */
export function KnowledgeManuscriptViewer({
  pages,
  title,
  tourId,
  onClose,
  onExitTopic,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const total = pages.length;
  const restored = tourId ? readManuscriptPage(tourId, total) : 0;
  const [index, setIndex] = useState(() => restored);
  const indexRef = useRef(index);
  const [shareBusy, setShareBusy] = useState(false);
  const [pageZoomed, setPageZoomed] = useState(false);
  const [loaded, setLoaded] = useState<Record<number, boolean>>(() => {
    const init: Record<number, boolean> = {};
    for (let i = Math.max(0, restored - 1); i <= Math.min(total - 1, restored + 1); i++) {
      init[i] = true;
    }
    return init;
  });
  const edgeSwipe = useRef<{ x: number; y: number; atStart: boolean } | null>(null);
  const didRestoreScroll = useRef(false);
  const current = pages[index] || pages[0];
  const pageMedia = current?.media;

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    const prev = document.documentElement.style.overflow;
    document.documentElement.classList.add('knowledge-viewer-lock');
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.classList.remove('knowledge-viewer-lock');
      document.documentElement.style.overflow = prev;
    };
  }, []);

  // 打开时滚到续读页
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || didRestoreScroll.current) return;
    const jump = () => {
      if (!el.clientWidth) return;
      didRestoreScroll.current = true;
      el.scrollLeft = restored * el.clientWidth;
      setIndex(restored);
    };
    jump();
    requestAnimationFrame(jump);
  }, [restored, total]);

  useEffect(() => {
    if (!tourId || total <= 0) return;
    writeManuscriptPage(tourId, index);
  }, [tourId, index, total]);

  // 邻页懒加载 + 预取
  useEffect(() => {
    setLoaded((prev) => {
      const next = { ...prev };
      for (let i = Math.max(0, index - 1); i <= Math.min(total - 1, index + 1); i++) {
        next[i] = true;
      }
      return next;
    });
    for (let i = Math.max(0, index - 1); i <= Math.min(total - 1, index + 1); i++) {
      const p = pages[i];
      if (!p?.src) continue;
      const { webp, fallback } = knowledgeRasterSources(p.src);
      if (webp) preloadSrc(webp);
      preloadSrc(fallback);
    }
  }, [index, pages, total]);

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
      return;
    }
    edgeSwipe.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      atStart: indexRef.current === 0,
    };
  };

  const onScrollerTouchEnd = (e: ReactTouchEvent) => {
    const start = edgeSwipe.current;
    edgeSwipe.current = null;
    if (!start?.atStart || pageZoomed) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (dx > 72 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      onExitTopic();
    }
  };

  const onShare = async () => {
    if (shareBusy || !current) return;
    setShareBusy(true);
    try {
      if (current.src) {
        const { webp, fallback } = knowledgeRasterSources(current.src);
        const res = await fetch(webp || fallback);
        if (!res.ok) throw new Error('missing');
        const blob = await res.blob();
        const file = new File([blob], current.src.split('/').pop() || 'manuscript.png', {
          type: 'image/png',
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
    <div className="knowledge-viewer" role="dialog" aria-modal="true" aria-label={title}>
      <header className="knowledge-viewer-bar">
        <button
          type="button"
          className="knowledge-viewer-icon-btn"
          aria-label="返回"
          onClick={onClose}
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
        <button
          type="button"
          className="knowledge-viewer-icon-btn"
          aria-label="分享"
          disabled={shareBusy}
          onClick={() => void onShare()}
        >
          <ShareGlyph />
        </button>
      </header>

      <div
        ref={scrollerRef}
        className={`knowledge-viewer-scroller${pageZoomed ? ' is-zoom-locked' : ''}`}
        onTouchStart={onScrollerTouchStart}
        onTouchEnd={onScrollerTouchEnd}
      >
        {pages.map((p, i) => {
          const near = Math.abs(i - index) <= 1;
          const show = near && Boolean(loaded[i]);
          const isVideoPage = p.media?.type === 'video' && Boolean(p.media.url);
          return (
            <div key={p.key} className="knowledge-viewer-page">
              {!near ? (
                <span className="knowledge-viewer-img-placeholder" aria-hidden />
              ) : (
                <PinchZoomPane
                  enabled={i === index && Boolean(p.src) && !p.text && !isVideoPage}
                  onZoomChange={(zoomed) => {
                    if (i === index) setPageZoomed(zoomed);
                  }}
                >
                  {!show ? (
                    <span className="knowledge-viewer-img-placeholder" aria-hidden />
                  ) : isVideoPage ? (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video
                      ref={i === index ? videoRef : undefined}
                      className="knowledge-viewer-video-inline"
                      src={knowledgeMediaUrl(p.media!.url)}
                      playsInline
                      controls
                      preload={i === index ? 'metadata' : 'none'}
                      poster={p.src ? knowledgeRasterSources(p.src).fallback : undefined}
                      onEnded={() => setMediaPlaying(false)}
                      onPause={() => setMediaPlaying(false)}
                      onPlay={() => setMediaPlaying(true)}
                    />
                  ) : p.text ? (
                    <article className="knowledge-viewer-text-leaf">
                      {p.text.title ? <h3>{p.text.title}</h3> : null}
                      <p>{p.text.body}</p>
                    </article>
                  ) : p.src ? (
                    <ManuscriptRaster
                      path={p.src}
                      alt={p.alt}
                      eager={i === index}
                    />
                  ) : (
                    <span className="knowledge-viewer-img-placeholder" aria-hidden />
                  )}
                </PinchZoomPane>
              )}
            </div>
          );
        })}
      </div>

      {total > 1 ? (
        <div className="knowledge-viewer-dots" aria-hidden>
          {pages.map((p, i) => (
            <span key={p.key} className={i === index ? 'is-on' : undefined} />
          ))}
        </div>
      ) : null}

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
