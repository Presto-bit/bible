'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const ITEMS = [
  { id: 'friend', label: '加好友', sub: '搜索 ID / 用户名', href: '/friend/add', icon: '👤' },
  { id: 'group', label: '建群', sub: '创建共读群', href: '/group/create', icon: '👥' },
  { id: 'plans', label: '读经计划', sub: '热门计划 · 个性定制', href: '/plans', icon: '📅' },
];

/** 微信式加号菜单：锚定在按钮附近弹出，点项跳转独立页。 */
export default function PlusMenu({
  anchorRef,
  open,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 16 });

  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    setPos({
      top: r.bottom + 8,
      right: Math.max(12, window.innerWidth - r.right),
    });
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return (
    <>
      <div className="plus-menu-backdrop" onClick={onClose} />
      <div
        ref={menuRef}
        className="plus-menu-pop"
        style={{ top: pos.top, right: pos.right }}
        role="menu"
      >
        <div className="plus-menu-arrow" />
        {ITEMS.map((it) => (
          <button
            key={it.id}
            type="button"
            className="plus-menu-item"
            role="menuitem"
            onClick={() => {
              onClose();
              router.push(it.href);
            }}
          >
            <span className="plus-menu-ic">{it.icon}</span>
            <span className="plus-menu-text">
              <strong>{it.label}</strong>
              <span className="muted">{it.sub}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
