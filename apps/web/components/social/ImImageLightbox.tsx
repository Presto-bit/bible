'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type ImLightboxImage = {
  src: string;
  alt?: string;
};

type Props = {
  images: ImLightboxImage[];
  index: number;
  onClose: () => void;
  onIndexChange?: (index: number) => void;
};

const MIN_SCALE = 1;
const MAX_SCALE = 4;

/** 轻量图片预览：双指缩放、双击放大、滑动切图、下滑关闭。 */
export function ImImageLightbox({ images, index, onClose, onIndexChange }: Props) {
  const safeIndex = Math.max(0, Math.min(index, images.length - 1));
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);
  const panStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const swipeStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastTap = useRef(0);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const setTransform = (s: number, x: number, y: number) => {
    scaleRef.current = s;
    txRef.current = x;
    tyRef.current = y;
    setScale(s);
    setTx(x);
    setTy(y);
  };

  const resetTransform = useCallback(() => setTransform(1, 0, 0), []);

  useEffect(() => {
    resetTransform();
  }, [safeIndex, resetTransform]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && safeIndex > 0) onIndexChange?.(safeIndex - 1);
      if (e.key === 'ArrowRight' && safeIndex < images.length - 1) onIndexChange?.(safeIndex + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, onIndexChange, safeIndex, images.length]);

  const pointerDist = () => {
    const pts = [...pointers.current.values()];
    if (pts.length < 2) return 0;
    const [a, b] = pts;
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      pinchStart.current = { dist: pointerDist(), scale: scaleRef.current };
      panStart.current = null;
      swipeStart.current = null;
      return;
    }
    if (scaleRef.current > 1.01) {
      panStart.current = {
        x: e.clientX,
        y: e.clientY,
        tx: txRef.current,
        ty: tyRef.current,
      };
      swipeStart.current = null;
    } else {
      swipeStart.current = { x: e.clientX, y: e.clientY, t: Date.now() };
      panStart.current = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2 && pinchStart.current) {
      const dist = pointerDist();
      if (dist <= 0 || pinchStart.current.dist <= 0) return;
      const next = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, (pinchStart.current.scale * dist) / pinchStart.current.dist),
      );
      setTransform(next, txRef.current, tyRef.current);
      return;
    }
    if (panStart.current && scaleRef.current > 1.01) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setTransform(scaleRef.current, panStart.current.tx + dx, panStart.current.ty + dy);
    }
  };

  const finishGesture = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) {
      const swipe = swipeStart.current;
      panStart.current = null;
      swipeStart.current = null;
      if (swipe && scaleRef.current <= 1.01) {
        const dx = e.clientX - swipe.x;
        const dy = e.clientY - swipe.y;
        const dt = Date.now() - swipe.t;
        if (dt < 500 && Math.abs(dy) > 80 && Math.abs(dy) > Math.abs(dx) * 1.2) {
          onClose();
          return;
        }
        if (dt < 450 && Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.2) {
          if (dx < 0 && safeIndex < images.length - 1) onIndexChange?.(safeIndex + 1);
          else if (dx > 0 && safeIndex > 0) onIndexChange?.(safeIndex - 1);
          return;
        }
      }
      if (scaleRef.current < 1.05) resetTransform();
    }
  };

  const onDoubleTap = (e: React.MouseEvent | React.PointerEvent) => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      if (scaleRef.current > 1.05) resetTransform();
      else {
        const rect = imgRef.current?.getBoundingClientRect();
        if (rect) {
          const cx = e.clientX - (rect.left + rect.width / 2);
          const cy = e.clientY - (rect.top + rect.height / 2);
          setTransform(2.2, -cx * 1.2, -cy * 1.2);
        } else {
          setTransform(2.2, 0, 0);
        }
      }
      lastTap.current = 0;
      return true;
    }
    lastTap.current = now;
    return false;
  };

  const current = images[safeIndex];
  if (!current) return null;

  return (
    <div className="im-lightbox" role="dialog" aria-modal="true" aria-label="图片预览">
      <button type="button" className="im-lightbox-backdrop" aria-label="关闭" onClick={onClose} />
      <div className="im-lightbox-chrome">
        <span className="im-lightbox-count">
          {images.length > 1 ? `${safeIndex + 1} / ${images.length}` : '预览'}
        </span>
        <button type="button" className="im-lightbox-close" onClick={onClose}>
          关闭
        </button>
      </div>
      <div
        className="im-lightbox-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishGesture}
        onPointerCancel={finishGesture}
        onClick={(e) => {
          if (onDoubleTap(e)) {
            e.preventDefault();
            return;
          }
          // 单击空白关闭（点在图片上不关，靠双击缩放）
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={current.src}
          alt={current.alt || '图片'}
          className="im-lightbox-img"
          draggable={false}
          style={{
            transform: `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`,
          }}
          onClick={(e) => {
            e.stopPropagation();
            onDoubleTap(e);
          }}
        />
      </div>
      {images.length > 1 ? (
        <div className="im-lightbox-nav">
          <button
            type="button"
            className="im-lightbox-nav-btn"
            disabled={safeIndex <= 0}
            onClick={() => onIndexChange?.(safeIndex - 1)}
          >
            上一张
          </button>
          <button
            type="button"
            className="im-lightbox-nav-btn"
            disabled={safeIndex >= images.length - 1}
            onClick={() => onIndexChange?.(safeIndex + 1)}
          >
            下一张
          </button>
        </div>
      ) : null}
    </div>
  );
}
