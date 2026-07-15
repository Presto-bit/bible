'use client';

import { useRef, useState, type ReactNode } from 'react';
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
  const startX = useRef(0);
  const dragging = useRef(false);
  const finePointer = isFinePointerUI();

  const setOffsetSafe = (next: number) => {
    offsetRef.current = next;
    setOffset(next);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (disabled || finePointer || !resolved.length) return;
    startX.current = e.touches[0].clientX;
    dragging.current = true;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current || disabled || finePointer) return;
    const dx = e.touches[0].clientX - startX.current;
    if (dx < 0) setOffsetSafe(Math.max(dx, -revealPx));
    else setOffsetSafe(0);
  };

  const onTouchEnd = () => {
    dragging.current = false;
    const cur = offsetRef.current;
    setOffsetSafe(cur < -openThreshold ? -revealPx : 0);
  };

  const handleContentClick = () => {
    if (offsetRef.current < -10) {
      setOffsetSafe(0);
      return;
    }
    onContentClick?.();
  };

  if (!resolved.length) {
    return (
      <div className="swipe-reveal-row" onClick={onContentClick}>
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
        className="swipe-reveal-content"
        style={finePointer ? undefined : { transform: `translateX(${offset}px)` }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onClick={handleContentClick}
      >
        {children}
      </div>
    </div>
  );
}
