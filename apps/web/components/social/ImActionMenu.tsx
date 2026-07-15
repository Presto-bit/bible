'use client';

import { useEffect, useRef, useState } from 'react';

export type ImActionItem = {
  label: string;
  onClick: () => void;
  danger?: boolean;
};

type Props = {
  items: ImActionItem[];
};

/** 统一「··· / 长按」消息操作菜单。 */
export function ImActionMenu({ items }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const longPress = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [open]);

  if (!items.length) return null;

  return (
    <div
      className="im-msg-menu"
      ref={wrapRef}
      onContextMenu={(e) => {
        e.preventDefault();
        setOpen(true);
      }}
      onTouchStart={() => {
        longPress.current = window.setTimeout(() => setOpen(true), 480);
      }}
      onTouchEnd={() => {
        if (longPress.current) window.clearTimeout(longPress.current);
      }}
      onTouchMove={() => {
        if (longPress.current) window.clearTimeout(longPress.current);
      }}
    >
      <button
        type="button"
        className="text-link"
        style={{ fontSize: 12 }}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        ···
      </button>
      {open ? (
        <div className="im-msg-menu-panel" onClick={(e) => e.stopPropagation()}>
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              className={it.danger ? 'danger' : undefined}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
