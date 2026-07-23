'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';

/** 独立滚动层：配置页在壳内下滑，避免与 app 底栏/残留 height 冲突 */
function useOpsPcScrollLock() {
  useEffect(() => {
    document.documentElement.classList.add('ops-pc-active');
    document.body.classList.add('ops-pc-active');
    document.documentElement.style.removeProperty('height');
    document.body.style.removeProperty('height');
    document.documentElement.style.removeProperty('overflow');
    document.body.style.removeProperty('overflow');
    return () => {
      document.documentElement.classList.remove('ops-pc-active');
      document.body.classList.remove('ops-pc-active');
    };
  }, []);
}

/** 活动运营 PC 壳：宽版工作台布局（新建 / 编辑） */
export function OpsPcShell({
  children,
  title,
  sub,
  backHref = '/admin?tab=ops',
  backLabel = '活动运营',
  actions,
  variant = 'default',
}: {
  children: ReactNode;
  title: string;
  sub?: ReactNode;
  backHref?: string | null;
  backLabel?: string;
  actions?: ReactNode;
  /** default | new（选型页适中宽）| edit（Canvas 满宽） */
  variant?: 'default' | 'new' | 'edit';
}) {
  useOpsPcScrollLock();
  const shellClass =
    variant === 'new'
      ? 'ops-pc-shell ops-pc-shell--new'
      : variant === 'edit'
        ? 'ops-pc-shell ops-pc-shell--edit'
        : 'ops-pc-shell';
  return (
    <main className={shellClass}>
      <header className="ops-pc-head">
        <div className="ops-pc-head-main">
          {backHref ? (
            <Link href={backHref} className="ops-back">
              ← {backLabel}
            </Link>
          ) : null}
          <h1 className="ops-page-title">{title}</h1>
          {sub ? <div className="ops-page-sub">{sub}</div> : null}
        </div>
        {actions ? <div className="ops-pc-head-actions">{actions}</div> : null}
      </header>
      {children}
    </main>
  );
}
