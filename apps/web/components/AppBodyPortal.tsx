'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useCloseOnTabNav } from '@/lib/use_close_on_tab_nav';

/**
 * 将弹层挂到 document.body，并用固定高层 stacking 保证在保活 pane / tabbar 之上。
 *
 * @param onTabAway 切主 Tab 时关闭（强烈建议传入 onClose，防止串到其它 Tab）
 */
export default function AppBodyPortal({
  children,
  onTabAway,
}: {
  children: ReactNode;
  onTabAway?: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useCloseOnTabNav(onTabAway ?? (() => {}), Boolean(onTabAway));
  if (!mounted) return null;
  return createPortal(
    <div className="app-body-portal-layer" data-app-body-portal>
      {children}
    </div>,
    document.body,
  );
}
