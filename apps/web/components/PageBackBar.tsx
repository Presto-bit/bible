'use client';

import Link from 'next/link';
import { MouseEvent } from 'react';

export type PageBackBarProps = {
  href?: string;
  onClick?: (e: MouseEvent<HTMLElement>) => void;
  /** 上一级名称，如「我的」「发现」；省略则仅显示 ‹ */
  label?: string;
  variant?: 'page' | 'sheet';
  className?: string;
  ariaLabel?: string;
};

function backClass(variant: 'page' | 'sheet', className?: string) {
  return ['nav-back', `nav-back-${variant}`, className].filter(Boolean).join(' ');
}

function BackContent({ label }: { label?: string }) {
  return (
    <>
      <span className="nav-back-chevron" aria-hidden>
        ‹
      </span>
      {label ? <span className="nav-back-label">{label}</span> : null}
    </>
  );
}

/** 全页 / 半屏统一返回：‹ + 可选上一级文案，44px 触控热区 */
export default function PageBackBar({
  href,
  onClick,
  label,
  variant = 'page',
  className,
  ariaLabel,
}: PageBackBarProps) {
  const a11y = ariaLabel ?? (label ? `返回${label}` : '返回');
  const cls = backClass(variant, className);

  if (href) {
    return (
      <Link href={href} className={cls} aria-label={a11y} onClick={onClick}>
        <BackContent label={label} />
      </Link>
    );
  }

  return (
    <button type="button" className={cls} aria-label={a11y} onClick={onClick}>
      <BackContent label={label} />
    </button>
  );
}

/** 半屏 Sheet 右上角关闭 */
export function SheetCloseButton({
  onClick,
  className,
  label = '关闭',
}: {
  onClick: () => void;
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      className={['nav-close', 'nav-close-sheet', className].filter(Boolean).join(' ')}
      aria-label={label}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
