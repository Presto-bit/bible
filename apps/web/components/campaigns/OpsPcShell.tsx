'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';

/** 解锁 html/body 滚动（避免从其它页残留 height/overflow 导致运营页无法下滑） */
function useOpsPcScrollUnlock() {
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

/** 活动运营 PC 壳：宽版工作台布局 */
export function OpsPcShell({
  children,
  title,
  sub,
  backHref = '/campaigns',
  backLabel = '活动运营',
  actions,
}: {
  children: ReactNode;
  title: string;
  sub?: ReactNode;
  backHref?: string | null;
  backLabel?: string;
  actions?: ReactNode;
}) {
  useOpsPcScrollUnlock();
  return (
    <main className="ops-pc-shell">
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
