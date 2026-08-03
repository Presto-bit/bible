'use client';

import type { ReactNode } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';

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
  children: ReactNode;
}) {
  return (
    <AppBodyPortal onTabAway={onClose}>
      <div
        className={['sheet-backdrop', 'reader-sheet-backdrop', backdropClassName].filter(Boolean).join(' ')}
        onClick={onClose}
        onTouchMove={(e) => e.stopPropagation()}
        data-dismiss-on-tab-nav
      >
        <div
          className={sheetClassName}
          onClick={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </AppBodyPortal>
  );
}
