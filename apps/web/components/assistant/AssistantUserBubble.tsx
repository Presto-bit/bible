'use client';

import { useEffect, useRef, useState } from 'react';
import { ImMsgActionPopover, type ImPopoverAction } from '@/components/social/ImMsgActionPopover';

type Props = {
  text: string;
  disabled?: boolean;
  /** Tab 保活：离开小爱时关掉挂到 body 的操作菜单 */
  paneActive?: boolean;
  onCopy: () => void;
  onEdit: () => void;
  onResend: () => void;
};

/**
 * 用户气泡：支持划选复制；长按 / 右键弹出 复制 · 编辑 · 重发。
 */
export function AssistantUserBubble({
  text,
  disabled = false,
  paneActive = true,
  onCopy,
  onEdit,
  onResend,
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
    if (disabled || !paneActive || !text.trim()) return;
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
    { id: 'copy', label: '复制', icon: '⧉', onClick: onCopy },
    { id: 'edit', label: '编辑', icon: '✎', onClick: onEdit },
    { id: 'resend', label: '重发', icon: '↻', onClick: onResend },
  ];

  return (
    <div className="assistant-user-block">
      <div
        role="button"
        tabIndex={0}
        className="assistant-user-text"
        aria-label="用户消息，长按可复制或编辑重发"
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
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
          openActions(e.currentTarget);
        }}
        onClick={() => {
          if (longPressFired.current) {
            longPressFired.current = false;
            return;
          }
          closeActions();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openActions(e.currentTarget);
          }
        }}
      >
        {text || '…'}
      </div>
      {menuOpen ? (
        <ImMsgActionPopover
          open
          anchorEl={anchorEl}
          align="end"
          actions={actions}
          onClose={closeActions}
        />
      ) : null}
    </div>
  );
}
