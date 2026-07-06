'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef, type ReactNode } from 'react';

const TAP_SLOP_PX = 10;

type Props = {
  href: string;
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
};

/** 专题入口卡：用按钮式导航替代 <a>，避免长按触发浏览器链接预览 */
export function TopicNavCard({ href, className, children, ariaLabel }: Props) {
  const router = useRouter();
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);

  const navigate = useCallback(() => {
    router.push(href);
  }, [router, href]);

  return (
    <div
      role="button"
      tabIndex={0}
      className={['topic-nav-card', className].filter(Boolean).join(' ')}
      aria-label={ariaLabel}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        startRef.current = { x: e.clientX, y: e.clientY };
        movedRef.current = false;
      }}
      onPointerMove={(e) => {
        const start = startRef.current;
        if (!start || movedRef.current) return;
        if (
          Math.abs(e.clientX - start.x) > TAP_SLOP_PX
          || Math.abs(e.clientY - start.y) > TAP_SLOP_PX
        ) {
          movedRef.current = true;
        }
      }}
      onPointerUp={(e) => {
        if (e.button !== 0) return;
        const start = startRef.current;
        startRef.current = null;
        if (!start || movedRef.current) return;
        navigate();
      }}
      onPointerCancel={() => {
        startRef.current = null;
        movedRef.current = false;
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate();
        }
      }}
    >
      {children}
    </div>
  );
}
