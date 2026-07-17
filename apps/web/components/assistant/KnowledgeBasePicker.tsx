'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  listKnowledgeBases,
  type KnowledgeBaseSummary,
} from '@/lib/api';

export const DEFAULT_KB_ID = 'platform';

type Props = {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
};

/** 小爱输入区：单选平台/专题知识库 */
export function KnowledgeBasePicker({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<KnowledgeBaseSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    void listKnowledgeBases()
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch(() => {
        if (!cancelled) {
          setItems([
            {
              id: 'platform',
              name: '平台知识库',
              description: '公版注释、研经与词典等平台资料（默认）',
              is_default: true,
              kind: 'platform',
            },
          ]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const current =
    items.find((k) => k.id === value) ??
    items.find((k) => k.is_default) ??
    items[0];
  const label = current?.name ?? '平台知识库';

  return (
    <div className="kb-picker" style={{ position: 'relative' }}>
      <button
        type="button"
        className="kb-picker-trigger muted"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        style={{
          border: 'none',
          background: 'transparent',
          padding: '2px 0',
          fontSize: 12,
          cursor: disabled ? 'default' : 'pointer',
        }}
      >
        📚 {label} ▾
      </button>
      {open && (
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
          {items.map((kb) => (
            <button
              key={kb.id}
              type="button"
              role="option"
              aria-selected={kb.id === value}
              className="kb-picker-option"
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                border: 'none',
                background: kb.id === value ? 'var(--wash, #f5f0e8)' : 'transparent',
                padding: '8px 10px',
                borderRadius: 8,
                cursor: 'pointer',
              }}
              onClick={() => {
                onChange(kb.id);
                setOpen(false);
              }}
            >
              <strong style={{ fontSize: 13 }}>{kb.name}</strong>
              <span className="muted" style={{ display: 'block', fontSize: 11, marginTop: 2 }}>
                {kb.description}
              </span>
            </button>
          ))}
          <Link
            href="/knowledge-bases"
            className="text-link"
            style={{ display: 'block', padding: '8px 10px', fontSize: 12 }}
            onClick={() => setOpen(false)}
          >
            浏览知识库 ›
          </Link>
        </div>
      )}
    </div>
  );
}
