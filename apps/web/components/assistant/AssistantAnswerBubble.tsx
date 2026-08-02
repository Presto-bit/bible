'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ImMsgActionPopover, type ImPopoverAction } from '@/components/social/ImMsgActionPopover';

type Props = {
  children: ReactNode;
  disabled?: boolean;
  /** Tab 保活：离开小爱时关掉挂到 body 的复制菜单 */
  paneActive?: boolean;
  onCopy: () => void;
};

/**
 * 小爱回答区：触控长按 / 右键弹出应用内「复制」，不调起系统拷贝/翻译栏。
 */
export function AssistantAnswerBubble({
  children,
  disabled = false,
  paneActive = true,
  onCopy,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStart = useRef<{ x: number; y: number } | null>(null);
  const longPressFired = useRef(false);

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressStart.current = null;
  };

  const openActions = (el?: HTMLElement | null) => {
    if (disabled || !paneActive) return;
    longPressFired.current = true;
    try {
      navigator.vibrate?.(12);
    } catch {
      /* ignore */
    }
    setAnchorEl(el ?? null);
    setMenuOpen(true);
  };

  const closeActions = () => {
    setMenuOpen(false);
    setAnchorEl(null);
  };

  useEffect(() => {
    if (paneActive) return;
    clearLongPress();
    closeActions();
  }, [paneActive]);

  const startLongPress = (el: HTMLElement, x: number, y: number) => {
    if (disabled || !paneActive) return;
    longPressFired.current = false;
    clearLongPress();
    longPressStart.current = { x, y };
    longPressTimer.current = setTimeout(() => openActions(el), 450);
  };

  const actions: ImPopoverAction[] = [
    {
      id: 'copy',
      label: '复制',
      icon: '⧉',
      onClick: () => {
        onCopy();
      },
    },
  ];

  return (
    <div
      className="assistant-answer-body"
      aria-label="小爱回答，长按可复制"
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        // 引用角标等可点控件：不抢长按
        if ((e.target as HTMLElement).closest('button, a, [role="button"]')) return;
        startLongPress(e.currentTarget, e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        const s = longPressStart.current;
        if (!s || !longPressTimer.current) return;
        if (Math.abs(e.clientX - s.x) > 12 || Math.abs(e.clientY - s.y) > 12) {
          clearLongPress();
        }
      }}
      onPointerUp={clearLongPress}
      onPointerCancel={clearLongPress}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if ((e.target as HTMLElement).closest('button, a, [role="button"]')) return;
        openActions(e.currentTarget);
      }}
      onClick={() => {
        if (longPressFired.current) {
          longPressFired.current = false;
          return;
        }
        closeActions();
      }}
    >
      {children}
      {menuOpen ? (
        <ImMsgActionPopover
          open
          anchorEl={anchorEl}
          align="start"
          actions={actions}
          onClose={closeActions}
        />
      ) : null}
    </div>
  );
}
