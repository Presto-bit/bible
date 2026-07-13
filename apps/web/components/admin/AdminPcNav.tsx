'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'presto_admin_pc_nav_collapsed';

export type AdminPcNavItem = {
  id: string;
  label: string;
  desc: string;
  href?: string;
  active?: boolean;
  onClick?: () => void;
};

type Props = {
  items: AdminPcNavItem[];
  foot?: ReactNode;
};

export default function AdminPcNav({ items, foot }: Props) {
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === '0') setCollapsed(false);
      if (saved === '1') setCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return (
    <aside
      className={`admin-pc-nav${collapsed ? ' is-collapsed' : ''}`}
      aria-label="PC 导航"
      data-collapsed={collapsed ? '1' : '0'}
    >
      <div className="admin-pc-brand">
        <div className="admin-pc-brand-text">
          <strong>管理后台</strong>
          <span className="muted">Desktop</span>
        </div>
        <button
          type="button"
          className="admin-pc-nav-toggle"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? '展开导航' : '折叠导航'}
          title={collapsed ? '展开导航' : '折叠导航'}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>
      <nav className="admin-pc-nav-list">
        {items.map((n) => {
          const className = `admin-pc-nav-item${n.active ? ' is-active' : ''}`;
          const label = (
            <>
              <span className="admin-pc-nav-icon" aria-hidden>
                {n.label.slice(0, 1)}
              </span>
              <span className="admin-pc-nav-copy">
                <span className="admin-pc-nav-label">{n.label}</span>
                <span className="admin-pc-nav-desc">{n.desc}</span>
              </span>
            </>
          );
          if (n.href) {
            return (
              <Link key={n.id} href={n.href} className={className} title={n.label}>
                {label}
              </Link>
            );
          }
          return (
            <button
              key={n.id}
              type="button"
              className={className}
              onClick={n.onClick}
              title={n.label}
            >
              {label}
            </button>
          );
        })}
      </nav>
      {foot ? <div className="admin-pc-nav-foot">{foot}</div> : null}
    </aside>
  );
}
