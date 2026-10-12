'use client';

import '@/styles/story_mode.css';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import type { KnowledgeLayout } from '@/lib/api';
import { recordMapTour } from '@/lib/badge_events';
import { clientWithBasePath } from '@/lib/basePath';
import {
  peekKnowledgeDetail,
  prefetchKnowledgeDetail,
} from '@/lib/knowledge_detail_cache';
import {
  manuscriptJourneyPages,
  manuscriptPagesFromLayout,
} from '@/components/knowledge/KnowledgeManuscriptFolio';
import { KnowledgeManuscriptViewer } from '@/components/knowledge/KnowledgeManuscriptViewer';

type Rect = { x: number; y: number; w: number; h: number };

export type KnowledgeTopicOverlayRequest = {
  id: string;
  note: boolean;
  title: string;
  /** 整页路由（深链/分享/兜底） */
  href: string;
  /** 列表卡上已解码的封面，作共享元素 */
  ghostSrc: string;
  from: Rect;
  natural: { w: number; h: number } | null;
};

type Phase = 'from' | 'grow' | 'shown' | 'fade' | 'measure' | 'shrink';

const GROW_MS = 300;
const VIEWER_FADE_MS = 160;
const SHRINK_MS = 300;

function fitRect(natural: KnowledgeTopicOverlayRequest['natural']): Rect {
  const vw = Math.max(window.innerWidth, 1);
  const vh = Math.max(window.innerHeight, 1);
  if (!natural || natural.w <= 0 || natural.h <= 0) return { x: 0, y: 0, w: vw, h: vh };
  const s = Math.min(vw / natural.w, vh / natural.h);
  const w = natural.w * s;
  const h = natural.h * s;
  return { x: (vw - w) / 2, y: (vh - h) / 2, w, h };
}

function findCardRect(id: string): Rect | null {
  const sel = `[data-knowledge-topic="${CSS.escape(id)}"] .knowledge-topic-card-media`;
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.bottom <= 0 || r.top >= window.innerHeight) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/** 把 fit 尺寸的整图「cover + 顶对齐」裁进卡片矩形：等比缩放 + clip，不形变 */
function ghostAtCard(fit: Rect, card: Rect): CSSProperties {
  const s = Math.max(card.w / fit.w, card.h / fit.h);
  const W = fit.w * s;
  const H = fit.h * s;
  const left = card.x + card.w / 2 - W / 2;
  const clipX = (W - card.w) / 2 / s;
  const clipB = (H - card.h) / s;
  const r = 16 / s;
  return {
    transform: `translate3d(${left - fit.x}px, ${card.y - fit.y}px, 0) scale(${s})`,
    clipPath: `inset(0px ${clipX}px ${clipB}px ${clipX}px round ${r}px)`,
  };
}

const GHOST_FULL: CSSProperties = {
  transform: 'translate3d(0, 0, 0) scale(1)',
  clipPath: 'inset(0px 0px 0px 0px round 0px)',
};

/**
 * 小红书式列表内浮层：封面从卡片放大 → 首图绘制后交叉淡入手稿；
 * 关闭时反向缩回同一张卡。列表始终在下方，不经路由，故无白屏。
 */
export function KnowledgeTopicOverlay({
  req,
  onClosed,
  onFallback,
}: {
  req: KnowledgeTopicOverlayRequest;
  onClosed: () => void;
  /** 无手稿数据：改走整页路由 */
  onFallback: (href: string, replaceOverlayEntry: boolean) => void;
}) {
  const [layout, setLayout] = useState<KnowledgeLayout | null>(
    () => peekKnowledgeDetail(req.id)?.layout ?? null,
  );
  const [phase, setPhase] = useState<Phase>('from');
  const [painted, setPainted] = useState(false);
  const [grown, setGrown] = useState(false);
  const [toRect, setToRect] = useState<Rect | null>(null);
  const fit = useMemo(() => fitRect(req.natural), [req.natural]);
  const closingRef = useRef(false);
  const pushedRef = useRef(false);
  const fellBackRef = useRef(false);

  const pages = useMemo(() => {
    if (!layout) return [];
    return req.note ? manuscriptPagesFromLayout(layout) : manuscriptJourneyPages(layout);
  }, [layout, req.note]);

  const fallback = useCallback(() => {
    if (fellBackRef.current) return;
    fellBackRef.current = true;
    const hadEntry = pushedRef.current;
    pushedRef.current = false;
    onFallback(req.href, hadEntry);
  }, [onFallback, req.href]);

  useEffect(() => {
    if (layout) return;
    let cancelled = false;
    void prefetchKnowledgeDetail(req.id).then((b) => {
      if (cancelled) return;
      if (b.layout) setLayout(b.layout);
      else fallback();
    });
    return () => {
      cancelled = true;
    };
  }, [layout, req.id, fallback]);

  useEffect(() => {
    if (layout && pages.length === 0) fallback();
  }, [layout, pages.length, fallback]);

  useEffect(() => {
    if (!req.note) recordMapTour(req.id);
  }, [req.id, req.note]);

  // 进场：双 rAF 确保起始帧已提交，再开过渡
  useEffect(() => {
    let r2 = 0;
    const r1 = window.requestAnimationFrame(() => {
      r2 = window.requestAnimationFrame(() => setPhase((p) => (p === 'from' ? 'grow' : p)));
    });
    const t = window.setTimeout(() => setGrown(true), GROW_MS);
    return () => {
      window.cancelAnimationFrame(r1);
      window.cancelAnimationFrame(r2);
      window.clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    if (phase === 'grow' && grown && painted) setPhase('shown');
  }, [phase, grown, painted]);

  const beginClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setPhase('fade');
  }, []);

  // 系统返回（安卓返回键 / 浏览器后退）关浮层，不离开列表
  useEffect(() => {
    if (!pushedRef.current) {
      try {
        const prev = (window.history.state as Record<string, unknown> | null) || {};
        window.history.pushState({ ...prev, kxOverlay: req.id }, '');
        pushedRef.current = true;
      } catch {
        pushedRef.current = false;
      }
    }
    const onPop = () => {
      if (!pushedRef.current) return;
      const st = window.history.state as { kxOverlay?: string } | null;
      if (st?.kxOverlay) return;
      pushedRef.current = false;
      beginClose();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [req.id, beginClose]);

  const requestClose = useCallback(() => {
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
    }
    beginClose();
  }, [beginClose]);

  useEffect(() => {
    if (phase === 'fade') {
      const t = window.setTimeout(() => setPhase('measure'), VIEWER_FADE_MS);
      return () => window.clearTimeout(t);
    }
    if (phase === 'measure') {
      // Viewer 已卸载、锁版解除后再量卡片位置
      const raf = window.requestAnimationFrame(() => {
        setToRect(findCardRect(req.id));
        setPhase('shrink');
      });
      return () => window.cancelAnimationFrame(raf);
    }
    if (phase === 'shrink') {
      const t = window.setTimeout(onClosed, SHRINK_MS + 40);
      return () => window.clearTimeout(t);
    }
    return;
  }, [phase, req.id, onClosed]);

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    return `${window.location.origin}${clientWithBasePath(req.href)}`;
  }, [req.href]);

  const ghostStyle: CSSProperties = {
    left: fit.x,
    top: fit.y,
    width: fit.w,
    height: fit.h,
    ...(phase === 'from'
      ? ghostAtCard(fit, req.from)
      : phase === 'shrink' && toRect
        ? ghostAtCard(fit, toRect)
        : GHOST_FULL),
  };

  const viewerMounted = Boolean(layout && pages.length > 0) &&
    phase !== 'measure' && phase !== 'shrink';

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={[
        'kx-overlay',
        `is-${phase}`,
        phase === 'shrink' && !toRect ? 'is-vanish' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="kx-overlay-backdrop" aria-hidden />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="kx-overlay-ghost"
        src={req.ghostSrc}
        alt=""
        draggable={false}
        style={ghostStyle}
        aria-hidden
      />
      {viewerMounted ? (
        <div className="kx-overlay-viewer">
          <KnowledgeManuscriptViewer
            pages={pages}
            title={layout?.title || req.title}
            tourId={req.id}
            onClose={requestClose}
            onExitTopic={requestClose}
            managed
            onFirstPaint={() => setPainted(true)}
            shareUrl={shareUrl}
          />
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
