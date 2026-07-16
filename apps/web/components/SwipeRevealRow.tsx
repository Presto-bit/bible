'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { isFinePointerUI } from '@/lib/touch_ui';

export type SwipeAction = {
  label: string;
  onClick: () => void;
  tone?: 'danger' | 'accent' | 'muted';
};

type Props = {
  children: ReactNode;
  /** 单按钮兼容；若传 actions 则优先生效 */
  onDelete?: () => void;
  deleteLabel?: string;
  actions?: SwipeAction[];
  onContentClick?: () => void;
  disabled?: boolean;
};

const BTN_PX = 72;

export function SwipeRevealRow({
  children,
  onDelete,
  deleteLabel = '删除',
  actions,
  onContentClick,
  disabled = false,
}: Props) {
  const resolved: SwipeAction[] =
    actions && actions.length
      ? actions
      : onDelete
        ? [{ label: deleteLabel, onClick: onDelete, tone: 'danger' }]
        : [];
  const revealPx = Math.max(BTN_PX, resolved.length * BTN_PX);
  const openThreshold = Math.min(36, revealPx / 2);

  const [offset, setOffset] = useState(0);
  const offsetRef = useRef(0);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const baseOffset = useRef(0);
  const dragging = useRef(false);
  const axisLock = useRef<'x' | 'y' | null>(null);
  const suppressClick = useRef(false);
  const onClickRef = useRef(onContentClick);
  onClickRef.current = onContentClick;
  const finePointer = isFinePointerUI();

  const setOffsetSafe = (next: number) => {
    if (offsetRef.current === next) return;
    offsetRef.current = next;
    setOffset(next);
  };

  // 非 passive touchmove，才能 preventDefault 挡住列表抢手势
  useEffect(() => {
    const el = contentRef.current;
    if (!el || disabled || !resolved.length) return;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      startX.current = t.clientX;
      startY.current = t.clientY;
      baseOffset.current = offsetRef.current;
      dragging.current = true;
      axisLock.current = null;
      suppressClick.current = offsetRef.current < -10;
    };

    const onMove = (e: TouchEvent) => {
      if (!dragging.current) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - startX.current;
      const dy = t.clientY - startY.current;
      if (!axisLock.current) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        axisLock.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }
      if (axisLock.current === 'y') {
        if (offsetRef.current < 0) setOffsetSafe(0);
        return;
      }
      suppressClick.current = true;
      e.preventDefault();
      const next = Math.max(-revealPx, Math.min(0, baseOffset.current + dx));
      setOffsetSafe(next);
    };

    const onEnd = () => {
      if (!dragging.current) return;
      dragging.current = false;
      const wasX = axisLock.current === 'x';
      axisLock.current = null;
      const cur = offsetRef.current;
      const next = cur < -openThreshold ? -revealPx : 0;
      if (wasX || Math.abs(cur - next) > 0.5) {
        suppressClick.current = true;
      }
      setOffsetSafe(next);
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [disabled, resolved.length, revealPx, openThreshold]);

  const handleContentClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      if (offsetRef.current < -10) setOffsetSafe(0);
      return;
    }
    if (offsetRef.current < -10) {
      setOffsetSafe(0);
      return;
    }
    onClickRef.current?.();
  };

  if (!resolved.length) {
    return (
      <div className="swipe-reveal-row" onClick={() => onClickRef.current?.()}>
        {children}
      </div>
    );
  }

  return (
    <div className="swipe-reveal-row">
      <div
        className={`swipe-reveal-actions${offset < -4 ? ' is-revealed' : ''}`}
        style={{ width: revealPx }}
        aria-hidden={offset >= -4}
      >
        {resolved.map((a) => (
          <button
            key={a.label}
            type="button"
            className={`swipe-reveal-action swipe-reveal-action-${a.tone || 'muted'}`}
            tabIndex={offset < -4 ? 0 : -1}
            onClick={(e) => {
              e.stopPropagation();
              a.onClick();
              setOffsetSafe(0);
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
      {finePointer ? (
        <div className="swipe-reveal-desktop-actions">
          {resolved.map((a) => (
            <button
              key={`d-${a.label}`}
              type="button"
              className={`swipe-reveal-desktop-btn swipe-reveal-desktop-btn-${a.tone || 'muted'}`}
              aria-label={a.label}
              onClick={(e) => {
                e.stopPropagation();
                a.onClick();
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      ) : null}
      <div
        ref={contentRef}
        className="swipe-reveal-content"
        style={{ transform: `translateX(${offset}px)` }}
        onClick={handleContentClick}
      >
        {children}
      </div>
    </div>
  );
}
