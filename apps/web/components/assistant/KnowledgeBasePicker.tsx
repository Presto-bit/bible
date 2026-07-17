'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export const DEFAULT_KB_ID = 'platform';

type Props = {
  value?: string;
  onChange?: (id: string) => void;
  disabled?: boolean;
  variant?: 'embed' | 'block';
};

/** 资料源图标：三层叠片，表示检索范围（非图书） */
function KbSourceIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 8.5h16" />
      <path d="M6 12.5h12" />
      <path d="M8 16.5h8" />
      <rect x="3.5" y="5.5" width="17" height="14" rx="2.5" opacity="0.35" />
    </svg>
  );
}

/** 小爱选库：当前仅平台知识库；专题仅作浏览文件夹 */
export function KnowledgeBasePicker({ disabled, variant = 'embed' }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('.kb-picker')) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const menu = open ? (
    <div
      className="card kb-picker-menu"
      role="listbox"
      style={{
        position: 'absolute',
        left: 0,
        bottom: '100%',
        marginBottom: 6,
        zIndex: 40,
        minWidth: 220,
        padding: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,.12)',
      }}
    >
      <div
        role="option"
        aria-selected
        style={{
          padding: '8px 10px',
          borderRadius: 8,
          background: 'var(--wash, #f5f0e8)',
        }}
      >
        <strong style={{ fontSize: 13 }}>平台知识库</strong>
        <span className="muted" style={{ display: 'block', fontSize: 11, marginTop: 2 }}>
          含中文研经、公版英文注释、原文与词典（默认）
        </span>
      </div>
      <Link
        href="/knowledge-bases"
        className="text-link"
        style={{ display: 'block', padding: '8px 10px', fontSize: 12 }}
        onClick={() => setOpen(false)}
      >
        浏览知识库 ›
      </Link>
    </div>
  ) : null;

  if (variant === 'embed') {
    return (
      <div className="kb-picker kb-picker-embed">
        <button
          type="button"
          className="compose-kb-inner"
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label="知识库：平台知识库"
          title="平台知识库"
          onClick={() => setOpen((v) => !v)}
        >
          <KbSourceIcon />
        </button>
        {menu}
      </div>
    );
  }

  return (
    <div className="kb-picker" style={{ position: 'relative' }}>
      <button
        type="button"
        className="kb-picker-trigger muted"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          border: 'none',
          background: 'transparent',
          padding: '2px 0',
          fontSize: 12,
          cursor: disabled ? 'default' : 'pointer',
        }}
      >
        平台知识库 ▾
      </button>
      {menu}
    </div>
  );
}
