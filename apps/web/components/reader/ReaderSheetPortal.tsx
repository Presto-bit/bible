'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/** 阅读器内底部/居中 Sheet：挂 body + 阻断触控穿透到经文层。 */
export default function ReaderSheetPortal({
  onClose,
  backdropClassName = '',
  sheetClassName = 'sheet card',
  children,
}: {
  onClose: () => void;
  backdropClassName?: string;
  sheetClassName?: string;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return createPortal(
    <div
      className={['sheet-backdrop', 'reader-sheet-backdrop', backdropClassName].filter(Boolean).join(' ')}
      onClick={onClose}
      onTouchMove={(e) => e.stopPropagation()}
    >
      <div
        className={sheetClassName}
        onClick={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
