'use client';

import { useEffect, useRef, useState } from 'react';
import { Pressable } from '@/components/ui/Pressable';

type ActionId = 'copy' | 'edit' | 'resend';

type Props = {
  text: string;
  disabled?: boolean;
  /** Tab 保活：离开小爱时关掉操作菜单 */
  paneActive?: boolean;
  onCopy: () => void;
  onEdit: () => void;
  onResend: () => void;
};

function ActionIcon({ id }: { id: ActionId }) {
  if (id === 'copy') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
        <rect x="8" y="8" width="12" height="12" rx="2" />
        <path d="M6 16V6a2 2 0 0 1 2-2h10" />
      </svg>
    );
  }
  if (id === 'edit') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
        <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
        <path d="M13.5 6.5l3 3" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path d="M21 12a9 9 0 1 1-2.6-6.3" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

/**
 * 用户气泡：划选复制（桌面）；长按 / 右键在问题下方弹出 复制 · 编辑 · 重发。
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
  const rootRef = useRef<HTMLDivElement | null>(null);
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

  const closeActions = () => {
    setMenuOpen(false);
  };

  const openActions = () => {
    if (disabled || !paneActive || !text.trim()) return;
    longPressFired.current = true;
    try {
      navigator.vibrate?.(12);
    } catch {
      /* ignore */
    }
    setMenuOpen(true);
  };

  useEffect(() => {
    if (paneActive) return;
    clearLongPress();
    closeActions();
  }, [paneActive]);

  useEffect(() => {
    if (!menuOpen) return;
    const onOutside = (e: PointerEvent) => {
      const root = rootRef.current;
      if (root && e.target instanceof Node && root.contains(e.target)) return;
      closeActions();
    };
    window.addEventListener('pointerdown', onOutside, true);
    return () => window.removeEventListener('pointerdown', onOutside, true);
  }, [menuOpen]);

  const startLongPress = (x: number, y: number) => {
    if (disabled || !paneActive) return;
    longPressFired.current = false;
    clearLongPress();
    longPressStart.current = { x, y };
    longPressTimer.current = setTimeout(openActions, 450);
  };

  const runAction = (fn: () => void) => {
    closeActions();
    fn();
  };

  const actions: { id: ActionId; label: string; onClick: () => void }[] = [
    { id: 'copy', label: '复制', onClick: onCopy },
    { id: 'edit', label: '编辑', onClick: onEdit },
    { id: 'resend', label: '重发', onClick: onResend },
  ];

  return (
    <div className="assistant-user-block" ref={rootRef}>
      <div
        role="button"
        tabIndex={0}
        className={`assistant-user-text${menuOpen ? ' is-actions-open' : ''}`}
        aria-label="用户消息，长按可复制或编辑重发"
        aria-expanded={menuOpen}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          startLongPress(e.clientX, e.clientY);
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
          openActions();
        }}
        onClick={() => {
          if (longPressFired.current) {
            longPressFired.current = false;
            return;
          }
          if (menuOpen) closeActions();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (menuOpen) closeActions();
            else openActions();
          }
          if (e.key === 'Escape') closeActions();
        }}
      >
        {text || '…'}
      </div>
      {menuOpen ? (
        <div className="assistant-user-actions" role="menu" aria-label="消息操作">
          {actions.map((a) => (
            <Pressable
              key={a.id}
              type="button"
              className="assistant-user-action"
              phase="up"
              onTap={() => runAction(a.onClick)}
            >
              <span className="assistant-user-action-icon" aria-hidden>
                <ActionIcon id={a.id} />
              </span>
              <span className="assistant-user-action-label">{a.label}</span>
            </Pressable>
          ))}
        </div>
      ) : null}
    </div>
  );
}
