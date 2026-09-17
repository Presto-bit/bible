'use client';

import '@/styles/story_mode.css';

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  dismissKnowledgeExpandLayer,
  finishKnowledgeCollapse,
  getKnowledgeExpandSession,
  holdKnowledgeExpand,
  subscribeKnowledgeExpand,
  type KnowledgeExpandOrigin,
  type KnowledgeExpandSession,
} from '@/lib/knowledge_nav';
import { knowledgeRasterSources } from '@/lib/knowledge_media_url';

const ENTER_MS = 380;
const LEAVE_MS = 300;
const REVEAL_FADE_MS = 180;

function styleVars(origin: KnowledgeExpandOrigin): CSSProperties {
  if (typeof window === 'undefined') return {};
  const vw = Math.max(window.innerWidth, 1);
  const vh = Math.max(window.innerHeight, 1);
  return {
    ['--kx' as string]: `${origin.x}px`,
    ['--ky' as string]: `${origin.y}px`,
    ['--ksx' as string]: String(origin.w / vw),
    ['--ksy' as string]: String(origin.h / vh),
    ['--kr' as string]: `${origin.radius || 16}px`,
  };
}

function useExpandSession(): KnowledgeExpandSession | null {
  return useSyncExternalStore(
    subscribeKnowledgeExpand,
    getKnowledgeExpandSession,
    () => null,
  );
}

/**
 * 壳层持久封面层：跨 /knowledge ↔ /search/map 不卸，负责小红书式放大/缩回。
 * 直接 portal 到 body（勿走 AppBodyPortal z=300，否则会被 Viewer z=1200 压住）。
 */
export default function KnowledgeExpandHost() {
  const session = useExpandSession();
  const [mounted, setMounted] = useState(false);
  const [visual, setVisual] = useState<'hidden' | 'from' | 'full' | 'to' | 'fade'>('hidden');
  const [layer, setLayer] = useState<KnowledgeExpandSession | null>(null);
  const phaseRef = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const phase = session?.phase ?? null;
    if (phase === phaseRef.current && phase !== 'idle') return;
    phaseRef.current = phase;

    if (!session) {
      if (visual !== 'hidden' && visual !== 'fade') {
        setVisual('hidden');
        setLayer(null);
      }
      return;
    }

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (session.phase === 'enter') {
      setLayer(session);
      if (reduced) {
        setVisual('full');
        holdKnowledgeExpand();
        return;
      }
      setVisual('from');
      let raf2 = 0;
      const raf1 = window.requestAnimationFrame(() => {
        raf2 = window.requestAnimationFrame(() => setVisual('full'));
      });
      const t = window.setTimeout(() => holdKnowledgeExpand(), ENTER_MS);
      return () => {
        window.cancelAnimationFrame(raf1);
        window.cancelAnimationFrame(raf2);
        window.clearTimeout(t);
      };
    }

    if (session.phase === 'hold') {
      setLayer(session);
      setVisual('full');
      return;
    }

    if (session.phase === 'leave') {
      setLayer(session);
      if (reduced) {
        setVisual('fade');
        const t = window.setTimeout(() => finishKnowledgeCollapse(), REVEAL_FADE_MS);
        return () => window.clearTimeout(t);
      }
      setVisual('full');
      let raf2 = 0;
      const raf1 = window.requestAnimationFrame(() => {
        raf2 = window.requestAnimationFrame(() => setVisual('to'));
      });
      const t = window.setTimeout(() => finishKnowledgeCollapse(), LEAVE_MS);
      return () => {
        window.cancelAnimationFrame(raf1);
        window.cancelAnimationFrame(raf2);
        window.clearTimeout(t);
      };
    }

    if (session.phase === 'idle') {
      setVisual('fade');
      const t = window.setTimeout(() => {
        setVisual('hidden');
        setLayer(null);
        dismissKnowledgeExpandLayer();
        phaseRef.current = null;
      }, REVEAL_FADE_MS);
      return () => window.clearTimeout(t);
    }

    return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  if (!mounted || visual === 'hidden' || !layer) return null;

  const coverPath = layer.cover || layer.origin.cover || '';
  const sources = knowledgeRasterSources(coverPath);

  return createPortal(
    <div
      className={[
        'knowledge-expand-layer',
        visual === 'from' ? 'is-from' : '',
        visual === 'full' ? 'is-full' : '',
        visual === 'to' ? 'is-to' : '',
        visual === 'fade' ? 'is-fade' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={styleVars(layer.origin)}
      aria-hidden
    >
      {coverPath ? (
        <picture>
          {sources.webp ? (
            <source type="image/webp" srcSet={sources.webp} />
          ) : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="knowledge-expand-layer-cover"
            src={sources.fallback}
            alt=""
            decoding="async"
            draggable={false}
          />
        </picture>
      ) : (
        <span className="knowledge-expand-layer-fallback" />
      )}
    </div>,
    document.body,
  );
}
