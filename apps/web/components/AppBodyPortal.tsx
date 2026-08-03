'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useCloseOnTabNav } from '@/lib/use_close_on_tab_nav';

/**
 * 将弹层挂到 document.body，避免被 Tab 保活层（z-index:1）压在 tabbar 下。
 * 不改动子树结构，仅做 portal；各 sheet 自带 backdrop / z-index。
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
  return createPortal(children, document.body);
}
