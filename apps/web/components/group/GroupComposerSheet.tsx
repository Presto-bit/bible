'use client';

import type { ComponentProps } from 'react';
import { GroupComposer } from './GroupComposer';

type ComposerProps = ComponentProps<typeof GroupComposer>;

type Props = ComposerProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function GroupComposerSheet({ open, onOpenChange, ...composerProps }: Props) {
  if (!open) {
    return (
      <button
        type="button"
        className="group-composer-fab"
        aria-label="打开打卡"
        onClick={() => onOpenChange(true)}
      >
        + 打卡
      </button>
    );
  }

  return (
    <div className="sheet-backdrop group-composer-backdrop" onClick={() => onOpenChange(false)}>
      <div
        className="sheet card group-composer-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="half-sheet-grab" aria-hidden />
        <div className="section-row" style={{ marginTop: 0, marginBottom: 8 }}>
          <strong>发送打卡</strong>
          <button type="button" className="text-link" onClick={() => onOpenChange(false)}>
            关闭
          </button>
        </div>
        <GroupComposer {...composerProps} />
      </div>
    </div>
  );
}
