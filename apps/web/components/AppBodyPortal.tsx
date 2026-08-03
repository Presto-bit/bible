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
  // 客户端首帧即可 portal，避免半屏晚一拍、安卓点开像「没反应」
  const [mounted, setMounted] = useState(() => typeof document !== 'undefined');
  useEffect(() => {
    if (!mounted) setMounted(true);
  }, [mounted]);
  useCloseOnTabNav(onTabAway ?? (() => {}), Boolean(onTabAway));
  if (!mounted) return null;
  return createPortal(
    <div className="app-body-portal-layer" data-app-body-portal>
      {children}
    </div>,
    document.body,
  );
}
