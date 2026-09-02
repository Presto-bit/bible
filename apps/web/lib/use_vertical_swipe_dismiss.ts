'use client';

import { useRef, useState, type RefObject, type TouchEventHandler } from 'react';
import { SHEET_DISMISS_DY } from '@/lib/reader_gesture';

const DRAG_CAP = 160;

/** 底部卡片/Sheet：下滑关闭；可选上滑触发 secondary（如展开专注层）。 */
export function useVerticalSwipeDismiss(opts: {
  onDismiss: () => void;
  onExpand?: () => void;
  expandDy?: number;
  dismissDy?: number;
  /** 内容区滚到顶时才允许下拉关闭 */
  scrollRef?: RefObject<HTMLElement | null>;
  /** 仅抓条/顶栏起手时关闭（专注层歌词区只上滑展开、不随手势关） */
  dismissFromHeaderOnly?: boolean;
  headerRef?: RefObject<HTMLElement | null>;
}) {
  const {
    onDismiss,
    onExpand,
    expandDy = 48,
    dismissDy = SHEET_DISMISS_DY,
    scrollRef,
    dismissFromHeaderOnly = false,
    headerRef,
  } = opts;

  const touchStartYRef = useRef<number | null>(null);
  const draggingDownRef = useRef(false);
  const draggingUpRef = useRef(false);
  const fromHeaderRef = useRef(false);
  const [dragOffset, setDragOffset] = useState(0);

  const reset = () => {
    touchStartYRef.current = null;
    draggingDownRef.current = false;
    draggingUpRef.current = false;
    fromHeaderRef.current = false;
    setDragOffset(0);
  };

  const onTouchStart: TouchEventHandler<HTMLElement> = (e) => {
    touchStartYRef.current = e.touches[0]?.clientY ?? null;
    draggingDownRef.current = false;
    draggingUpRef.current = false;
    const t = e.target;
    fromHeaderRef.current =
      t instanceof Node
      && (headerRef?.current?.contains(t) === true
        || (t instanceof Element && t.classList.contains('half-sheet-grab')));
  };

  const onTouchMove: TouchEventHandler<HTMLElement> = (e) => {
    const startY = touchStartYRef.current;
    if (startY == null) return;
    const dy = (e.touches[0]?.clientY ?? startY) - startY;
    const atTop =
      fromHeaderRef.current || (scrollRef?.current?.scrollTop ?? 0) <= 0;
    const canDismiss = !dismissFromHeaderOnly || fromHeaderRef.current;

    if (dy > 0 && atTop && canDismiss) {
      draggingDownRef.current = true;
      draggingUpRef.current = false;
      setDragOffset(Math.min(dy, DRAG_CAP));
      e.stopPropagation();
    } else if (dy < 0 && onExpand) {
      draggingUpRef.current = true;
      draggingDownRef.current = false;
      setDragOffset(0);
      e.stopPropagation();
    } else if (draggingDownRef.current) {
      draggingDownRef.current = false;
      setDragOffset(0);
    }
  };

  const onTouchEnd: TouchEventHandler<HTMLElement> = (e) => {
    const startY = touchStartYRef.current;
    const dy = startY != null ? (e.changedTouches[0]?.clientY ?? startY) - startY : 0;
    const shouldDismiss = draggingDownRef.current && dy > dismissDy;
    const shouldExpand = draggingUpRef.current && dy < -expandDy;
    reset();
    if (shouldDismiss) onDismiss();
    else if (shouldExpand) onExpand?.();
  };

  const onTouchCancel: TouchEventHandler<HTMLElement> = () => {
    reset();
  };

  return {
    dragOffset,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
  };
}
