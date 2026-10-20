'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import PageBackBar from '@/components/PageBackBar';

export type ImThreadMenuItem = {
  id: string;
  label: string;
  onSelect: () => void;
};

type Props = {
  title: string;
  titleExtra?: ReactNode;
  onTitleClick?: () => void;
  items: ImThreadMenuItem[];
  className?: string;
};

/** 群聊 / 私聊共用顶栏：返回、居中名字、⋯。 */
export function ImThreadNav({ title, titleExtra, onTitleClick, items, className }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const TitleTag = onTitleClick ? 'button' : 'div';

  return (
    <header className={`group-wechat-nav im-thread-nav${className ? ` ${className}` : ''}`}>
      <PageBackBar href="/discover" label="消息" />
      <TitleTag
        type={onTitleClick ? 'button' : undefined}
        className="group-wechat-nav-center"
        onClick={onTitleClick}
      >
        <span className="group-wechat-name">{title}</span>
        {titleExtra}
      </TitleTag>
      <div className="group-wechat-nav-actions im-thread-menu" ref={wrapRef}>
        <button
          type="button"
          className="group-wechat-settings icon-btn"
          aria-label="更多"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          ⋯
        </button>
        {open ? (
          <div className="im-thread-menu-pop" role="menu">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </header>
  );
}
