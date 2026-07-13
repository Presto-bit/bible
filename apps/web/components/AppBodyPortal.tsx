'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * 将弹层挂到 document.body，避免被 Tab 保活层（z-index:1）压在 tabbar 下。
 * 不改动子树结构，仅做 portal；各 sheet 自带 backdrop / z-index。
 */
export default function AppBodyPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
